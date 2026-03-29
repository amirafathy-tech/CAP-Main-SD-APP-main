const cds = require('@sap/cds');
const { string } = require('@sap/cds/lib/core/classes');
const axios = require('axios');
const { Buffer } = require('buffer');
const tempDataService = {
  store: new Map(),

  // Mirror Java TempExecutionOrderData.getCurrentQuantity()
  _currentQuantity(data) {
    const { quantities, currentQuantityIndex } = data;
    if (!quantities.length || currentQuantityIndex < 0 || currentQuantityIndex >= quantities.length) {
      return null;
    }
    return quantities[currentQuantityIndex];
  },

  getOrCreate(code) {
    if (!this.store.has(code)) {
      this.store.set(code, {
        quantities: [],
        currentQuantityIndex: 0,
        amountPerUnit: 0,
        actualQuantity: 0,
        total: 0,
        totalHeader: 0,
        remainingQuantity: 0,
        actualPercentage: 0,
        version: 0
      });
    }
    return this.store.get(code);
  },

  get(code) {
    return this.store.get(code);
  },

  // Convenience — matches Java getCurrentQuantity() semantics
  getCurrentQuantity(code) {
    const data = this.store.get(code);
    return data ? this._currentQuantity(data) : null;
  },

  update(code, data) {
    this.store.set(code, data);
  },

  remove(code) {
    this.store.delete(code);
  }
};

// const { v4: uuidv4 } = require('uuid'); // for unique ids if needed

module.exports = cds.service.impl(async function () {
  const user = 'BTP_USER1';
  const password = '#yiVfheJbFolFxgkEwCBFcWvYkPzrQDENEArAXn5';
  const auth = Buffer.from(`${user}:${password}`).toString('base64');
  const authHeader = `Basic ${auth}`;
  const
    {
      Currency, LineType,
      MaterialGroup, Formulas,
      UnitOfMeasurement,
      PersonnelNumber, InvoiceMainItems,
      ServiceNumbers, ServiceType, InvoiceSubItems,
      ModelSpecifications, ModelSpecificationsDetails,
      ExecutionOrderMains, ServiceInvoiceMains
    } = this.entities;


  ///////////////////////////////////////////////////////////////////////////
  this.on('saveOrUpdateMainItems', async (req) => {
    const {
      salesQuotation,
      salesQuotationItem,
      pricingProcedureStep,
      pricingProcedureCounter,
      customerNumber,
      invoiceMainItemCommands
    } = req.data;

    const tx = cds.transaction(req);
    let savedItems = [];

    try {
      // Step 1: delete existing items for that quotation/item
      if (salesQuotation && salesQuotationItem) {
        await tx.run(
          DELETE.from(InvoiceMainItems).where({
            referenceId: salesQuotation,
            salesQuotationItem
          })
        );
      }

      // Step 2: process each main item
      for (const command of invoiceMainItemCommands) {
        const mainItem = { ...command };
        mainItem.referenceId = salesQuotation;
        mainItem.salesQuotationItem = salesQuotationItem;

        const subItems = mainItem.subItemList || [];
        delete mainItem.subItemList;

        // 🔹 fetch quotation details (Authorization required for S4HANA cloud)
        const response = await axios.get(
          'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?$top=50',
          { headers: { Accept: 'application/json', Authorization: authHeader } }
        );

        const quotations = response?.data?.d?.results || [];
        for (const quotation of quotations) {
          if (quotation.SalesQuotation === salesQuotation) {
            mainItem.referenceSDDocument = quotation.ReferenceSDDocument;
            break;
          }
        }

        // insert main item
        const inserted = await tx.run(
          INSERT.into(InvoiceMainItems).entries(mainItem)
        );
        const savedMain = inserted[0] ?? mainItem;

        // insert sub items
        for (const sub of subItems) {
          sub.invoiceMainItemCode = savedMain.invoiceMainItemCode;
          await tx.run(INSERT.into(InvoiceSubItems).entries(sub));
        }

        // calculate total header — wrap with Number() to prevent string concatenation
        // (totalWithProfit arrives as a formatted string e.g. "150.000" from the frontend)
        const totalHeader =
          Number(savedMain.totalWithProfit || 0) +
          subItems.reduce((sum, s) => sum + Number(s.total || 0), 0);

        await tx.run(
          UPDATE(InvoiceMainItems)
            .set({ totalHeader })
            .where({ invoiceMainItemCode: savedMain.invoiceMainItemCode })
        );

        savedMain.totalHeader = totalHeader;
        // 🔹 re-fetch subitems for this main item
        const insertedSubItems = await tx.run(
          SELECT.from(InvoiceSubItems).where({ invoiceMainItemCode: savedMain.invoiceMainItemCode })
        );

        // attach subitems
        savedMain.subItemList = insertedSubItems || [];

        // push to results
        savedItems.push(savedMain);

      }

      // Step 3: Call external pricing API (like in your Java code)
      try {
        const totalHeaderSum = savedItems.reduce(
          (sum, item) => sum + Number(item.totalHeader || 0),
          0
        );

        await callInvoicePricingAPI(
          salesQuotation,
          salesQuotationItem,
          pricingProcedureStep,
          pricingProcedureCounter,
          totalHeaderSum
        );
      } catch (apiErr) {
        req.warn(`Failed to update pricing: ${apiErr.message}`);
      }

      return savedItems;
    } catch (err) {
      req.error(500, `Error in saveOrUpdateMainItems: ${err.message}`);
    }
  });

  async function callInvoicePricingAPI(
    salesQuotation,
    salesQuotationItem,
    pricingProcedureStep,
    pricingProcedureCounter,
    totalHeader
  ) {
    const body = {
      ConditionType: 'PPR0',
      ConditionRateValue: (Math.round(Number(totalHeader) * 100) / 100).toFixed(2)
    };

    const credentials = 'BTP_USER1:#yiVfheJbFolFxgkEwCBFcWvYkPzrQDENEArAXn5';
    const encoded = Buffer.from(credentials, 'utf8').toString('base64');

    const tokenResp = await axios.get(
      `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='${salesQuotation}',SalesQuotationItem='${salesQuotationItem}')/to_PricingElement?$top=50`,
      {
        headers: {
          'x-csrf-token': 'Fetch',
          Authorization: `Basic ${encoded}`,
          Accept: 'application/json'
        }
      }
    );

    const csrfToken = tokenResp.headers['x-csrf-token'];
    const cookies = tokenResp.headers['set-cookie'];
    if (!csrfToken) throw new Error('Failed to fetch CSRF token');

    const patchURL = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItemPrcgElmnt(SalesQuotation='${salesQuotation}',SalesQuotationItem='${salesQuotationItem}',PricingProcedureStep='${pricingProcedureStep}',PricingProcedureCounter='${pricingProcedureCounter}')`;

    await axios.patch(patchURL, body, {
      headers: {
        Authorization: `Basic ${encoded}`,
        'x-csrf-token': csrfToken,
        'If-Match': '*',
        'Content-Type': 'application/json',
        Cookie: cookies.join('; ')
      }
    });
  }
  /////////////////////////////////////////////////////////////////////////
  this.on('getInvoiceMainItemByReferenceIdAndItemNumber', async (req) => {
    const { referenceId, salesQuotationItem } = req.data;

    // Fetch matching items from DB
    const db = cds.transaction(req);
    // let items = await db.run(
    //   SELECT.from(InvoiceMainItems).columns(
    //     '*',
    //     { subItemList: ['*'] }   
    //   ).where({
    //     referenceId: referenceId,
    //     salesQuotationItem: salesQuotationItem
    //   })
    // );
    const items = await cds.read(InvoiceMainItems, i => {
      i('*', i.subItemList('*'))   // shorthand expand syntax
    }).where({ referenceId, salesQuotationItem });
    if (!items.length) {
      return []; // or throw req.error(404, 'No matching items found');
    }

    // Call external S4 API for SalesQuotationItemText
    const response = await axios.get(
      `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?SalesQuotation=${referenceId}`,
      { headers: { Accept: 'application/json' } }
    );

    // Extract array safely
    const results = response.data?.d?.results || [];

    // Find matching item
    const matchingNode = results.find(
      (node) => node.SalesQuotationItem === salesQuotationItem
    );

    if (matchingNode) {
      items = items.map((item) => {
        item.salesQuotationItemText = matchingNode.SalesQuotationItemText;
        return item;
      });

      // Optionally update DB
      for (const item of items) {
        await db.run(
          UPDATE(InvoiceMainItems, item.ID).set({
            salesQuotationItemText: item.salesQuotationItemText
          })
        );
      }
    }

    return items;
  });


  async function deleteByReferenceIdAndSalesQuotationItem(referenceId, salesQuotationItem) {
    return await DELETE.from(InvoiceMainItems).where({ referenceId, salesQuotationItem });
  }


  /*-------------------------- First App -------------------------------------*/


  //#region SD App 1 APIs


  // --- Currency Handlers ---
  if (Currency) {
    this.on('READ', Currency, async (req) => {
      console.log('Executing READ for all Currencies');
      try {
        const tx = cds.tx(req);
        const currencies = await tx.run(SELECT.from(Currency));
        console.log('Currency response:', JSON.stringify(currencies));
        return currencies;
      } catch (error) {
        console.error('Error in READ Currency:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('READ', Currency, async (req) => {
      console.log('Executing READ for Currency by ID');
      const currencyCode = req.params[0]?.currencyCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'currencyCode')?.val;
      if (!currencyCode) {
        throw new Error('Currency code is required');
      }
      try {
        const tx = cds.tx(req);
        const currency = await tx.run(SELECT.one.from(Currency).where({ currencyCode: currencyCode }));
        console.log('Currency response by ID:', JSON.stringify(currency));
        return currency;
      } catch (error) {
        console.error('Error in READ Currency by ID:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('CREATE', Currency, async (req) => {
      console.log('Executing CREATE for new Currency');
      const newCurrency = req.data;
      try {
        const tx = cds.tx(req);
        const created = await tx.run(INSERT.into(Currency).entries(newCurrency));
        console.log('Created Currency:', JSON.stringify(created));
        await tx.commit();
        return created;
      } catch (error) {
        console.error('Error in CREATE Currency:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('DELETE', Currency, async (req) => {
      console.log('Executing DELETE for Currency');
      const currencyCode = req.params[0]?.currencyCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'currencyCode')?.val;
      if (!currencyCode) {
        throw new Error('Currency code is required');
      }
      try {
        const tx = cds.tx(req);
        const deleted = await tx.run(DELETE.from(Currency).where({ currencyCode: currencyCode }));
        console.log('Deleted Currency:', JSON.stringify(deleted));
        await tx.commit();
        return { success: true };
      } catch (error) {
        console.error('Error in DELETE Currency:', error.message);
        await tx.rollback();
        throw new Error(`Database delete failed: ${error.message}`);
      }
    });

    this.on('UPDATE', Currency, async (req) => {
      console.log('Executing UPDATE for Currency');
      const currencyCode = req.params[0]?.currencyCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'currencyCode')?.val;
      if (!currencyCode) {
        throw new Error('Currency code is required');
      }
      try {
        const tx = cds.tx(req);
        const updated = await tx.run(UPDATE(Currency).with(req.data).where({ currencyCode: currencyCode }));
        console.log('Updated Currency:', JSON.stringify(updated));
        await tx.commit();
        return updated;
      } catch (error) {
        console.error('Error in UPDATE Currency:', error.message);
        await tx.rollback();
        throw new Error(`Database update failed: ${error.message}`);
      }
    });
  }

  // --- LineType Handlers ---
  if (LineType) {
    this.on('READ', LineType, async (req) => {
      console.log('Executing READ for all LineTypes');
      try {
        const tx = cds.tx(req);
        const lineTypes = await tx.run(SELECT.from(LineType));
        console.log('LineType response:', JSON.stringify(lineTypes));
        return lineTypes;
      } catch (error) {
        console.error('Error in READ LineType:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('READ', LineType, async (req) => {
      console.log('Executing READ for LineType by ID');
      const lineTypeCode = req.params[0]?.lineTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'lineTypeCode')?.val;
      if (!lineTypeCode) {
        throw new Error('LineType code is required');
      }
      try {
        const tx = cds.tx(req);
        const lineType = await tx.run(SELECT.one.from(LineType).where({ lineTypeCode: lineTypeCode }));
        console.log('LineType response by ID:', JSON.stringify(lineType));
        return lineType;
      } catch (error) {
        console.error('Error in READ LineType by ID:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('CREATE', LineType, async (req) => {
      console.log('Executing CREATE for new LineType');
      const newLineType = req.data;
      try {
        const tx = cds.tx(req);
        const created = await tx.run(INSERT.into(LineType).entries(newLineType));
        console.log('Created LineType:', JSON.stringify(created));
        await tx.commit();
        return created;
      } catch (error) {
        console.error('Error in CREATE LineType:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('createLineType', LineType, async (req) => {
      console.log('Executing createLineType action for new LineType', JSON.stringify(req.data));
      const { lineTypeCode, code, description } = req.data;
      if (!lineTypeCode || !code || !description) {
        throw new Error('lineTypeCode, code, and description are required');
      }
      try {
        const tx = cds.tx(req);
        const insertData = { lineTypeCode, code, description };
        console.log('Inserting data:', JSON.stringify(insertData));
        const created = await tx.run(INSERT.into(LineType).entries(insertData));
        console.log('Inserted LineType result:', JSON.stringify(created));
        await tx.commit();
        if (!created || created.length === 0) {
          throw new Error('No record created');
        }
        const result = await tx.run(SELECT.one.from(LineType).where({ lineTypeCode }));
        console.log('Fetched created LineType:', JSON.stringify(result));
        return result;
      } catch (error) {
        console.error('Error in createLineType:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('DELETE', LineType, async (req) => {
      console.log('Executing DELETE for LineType');
      const lineTypeCode = req.params[0]?.lineTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'lineTypeCode')?.val;
      if (!lineTypeCode) {
        throw new Error('LineType code is required');
      }
      try {
        const tx = cds.tx(req);
        const deleted = await tx.run(DELETE.from(LineType).where({ lineTypeCode: lineTypeCode }));
        console.log('Deleted LineType:', JSON.stringify(deleted));
        await tx.commit();
        return { success: true };
      } catch (error) {
        console.error('Error in DELETE LineType:', error.message);
        await tx.rollback();
        throw new Error(`Database delete failed: ${error.message}`);
      }
    });

    this.on('UPDATE', LineType, async (req) => {
      console.log('Executing UPDATE for LineType');
      const lineTypeCode = req.params[0]?.lineTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'lineTypeCode')?.val;
      if (!lineTypeCode) {
        throw new Error('LineType code is required');
      }
      try {
        const tx = cds.tx(req);
        const updated = await tx.run(UPDATE(LineType).with(req.data).where({ lineTypeCode: lineTypeCode }));
        console.log('Updated LineType:', JSON.stringify(updated));
        await tx.commit();
        return updated;
      } catch (error) {
        console.error('Error in UPDATE LineType:', error.message);
        await tx.rollback();
        throw new Error(`Database update failed: ${error.message}`);
      }
    });
  }

  // --- MaterialGroup Handlers ---
  if (MaterialGroup) {
    this.on('READ', MaterialGroup, async (req) => {
      console.log('Executing READ for all MaterialGroups');
      try {
        const tx = cds.tx(req);
        const materialGroups = await tx.run(SELECT.from(MaterialGroup));
        console.log('MaterialGroup response:', JSON.stringify(materialGroups));
        return materialGroups;
      } catch (error) {
        console.error('Error in READ MaterialGroup:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('READ', MaterialGroup, async (req) => {
      console.log('Executing READ for MaterialGroup by ID');
      const materialGroupCode = req.params[0]?.materialGroupCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'materialGroupCode')?.val;
      if (!materialGroupCode) {
        throw new Error('MaterialGroup code is required');
      }
      try {
        const tx = cds.tx(req);
        const materialGroup = await tx.run(SELECT.one.from(MaterialGroup).where({ materialGroupCode: materialGroupCode }));
        console.log('MaterialGroup response by ID:', JSON.stringify(materialGroup));
        return materialGroup;
      } catch (error) {
        console.error('Error in READ MaterialGroup by ID:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('CREATE', MaterialGroup, async (req) => {
      console.log('Executing CREATE for new MaterialGroup');
      const newMaterialGroup = req.data;
      try {
        const tx = cds.tx(req);
        const created = await tx.run(INSERT.into(MaterialGroup).entries(newMaterialGroup));
        console.log('Created MaterialGroup:', JSON.stringify(created));
        await tx.commit();
        return created;
      } catch (error) {
        console.error('Error in CREATE MaterialGroup:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('DELETE', MaterialGroup, async (req) => {
      console.log('Executing DELETE for MaterialGroup');
      const materialGroupCode = req.params[0]?.materialGroupCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'materialGroupCode')?.val;
      if (!materialGroupCode) {
        throw new Error('MaterialGroup code is required');
      }
      try {
        const tx = cds.tx(req);
        const deleted = await tx.run(DELETE.from(MaterialGroup).where({ materialGroupCode: materialGroupCode }));
        console.log('Deleted MaterialGroup:', JSON.stringify(deleted));
        await tx.commit();
        return { success: true };
      } catch (error) {
        console.error('Error in DELETE MaterialGroup:', error.message);
        await tx.rollback();
        throw new Error(`Database delete failed: ${error.message}`);
      }
    });

    this.on('UPDATE', MaterialGroup, async (req) => {
      console.log('Executing UPDATE for MaterialGroup');
      const materialGroupCode = req.params[0]?.materialGroupCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'materialGroupCode')?.val;
      if (!materialGroupCode) {
        throw new Error('MaterialGroup code is required');
      }
      try {
        const tx = cds.tx(req);
        const updated = await tx.run(UPDATE(MaterialGroup).with(req.data).where({ materialGroupCode: materialGroupCode }));
        console.log('Updated MaterialGroup:', JSON.stringify(updated));
        await tx.commit();
        return updated;
      } catch (error) {
        console.error('Error in UPDATE MaterialGroup:', error.message);
        await tx.rollback();
        throw new Error(`Database update failed: ${error.message}`);
      }
    });
  }

  // --- PersonnelNumber Handlers ---
  if (PersonnelNumber) {
    this.on('READ', PersonnelNumber, async (req) => {
      console.log('Executing READ for all PersonnelNumbers');
      try {
        const tx = cds.tx(req);
        const personnelNumbers = await tx.run(SELECT.from(PersonnelNumber));
        console.log('PersonnelNumber response:', JSON.stringify(personnelNumbers));
        return personnelNumbers;
      } catch (error) {
        console.error('Error in READ PersonnelNumber:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('READ', PersonnelNumber, async (req) => {
      console.log('Executing READ for PersonnelNumber by ID');
      const personnelNumberCode = req.params[0]?.personnelNumberCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'personnelNumberCode')?.val;
      if (!personnelNumberCode) {
        throw new Error('PersonnelNumber code is required');
      }
      try {
        const tx = cds.tx(req);
        const personnelNumber = await tx.run(SELECT.one.from(PersonnelNumber).where({ personnelNumberCode: personnelNumberCode }));
        console.log('PersonnelNumber response by ID:', JSON.stringify(personnelNumber));
        return personnelNumber;
      } catch (error) {
        console.error('Error in READ PersonnelNumber by ID:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('CREATE', PersonnelNumber, async (req) => {
      console.log('Executing CREATE for new PersonnelNumber');
      const newPersonnelNumber = req.data;
      try {
        const tx = cds.tx(req);
        const created = await tx.run(INSERT.into(PersonnelNumber).entries(newPersonnelNumber));
        console.log('Created PersonnelNumber:', JSON.stringify(created));
        await tx.commit();
        return created;
      } catch (error) {
        console.error('Error in CREATE PersonnelNumber:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('DELETE', PersonnelNumber, async (req) => {
      console.log('Executing DELETE for PersonnelNumber');
      const personnelNumberCode = req.params[0]?.personnelNumberCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'personnelNumberCode')?.val;
      if (!personnelNumberCode) {
        throw new Error('PersonnelNumber code is required');
      }
      try {
        const tx = cds.tx(req);
        const deleted = await tx.run(DELETE.from(PersonnelNumber).where({ personnelNumberCode: personnelNumberCode }));
        console.log('Deleted PersonnelNumber:', JSON.stringify(deleted));
        await tx.commit();
        return { success: true };
      } catch (error) {
        console.error('Error in DELETE PersonnelNumber:', error.message);
        await tx.rollback();
        throw new Error(`Database delete failed: ${error.message}`);
      }
    });

    this.on('UPDATE', PersonnelNumber, async (req) => {
      console.log('Executing UPDATE for PersonnelNumber');
      const personnelNumberCode = req.params[0]?.personnelNumberCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'personnelNumberCode')?.val;
      if (!personnelNumberCode) {
        throw new Error('PersonnelNumber code is required');
      }
      try {
        const tx = cds.tx(req);
        const updated = await tx.run(UPDATE(PersonnelNumber).with(req.data).where({ personnelNumberCode: personnelNumberCode }));
        console.log('Updated PersonnelNumber:', JSON.stringify(updated));
        await tx.commit();
        return updated;
      } catch (error) {
        console.error('Error in UPDATE PersonnelNumber:', error.message);
        await tx.rollback();
        throw new Error(`Database update failed: ${error.message}`);
      }
    });
  }


  // --- ServiceType Handlers ---
  if (ServiceType) {
    this.on('READ', ServiceType, async (req) => {
      console.log('Executing READ for all ServiceTypes');
      try {
        const tx = cds.tx(req);
        const serviceTypes = await tx.run(SELECT.from(ServiceType));
        console.log('ServiceType response:', JSON.stringify(serviceTypes));
        return serviceTypes;
      } catch (error) {
        console.error('Error in READ ServiceType:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('READ', ServiceType, async (req) => {
      console.log('Executing READ for ServiceType by ID');
      const serviceTypeCode = req.params[0]?.serviceTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'serviceTypeCode')?.val;
      if (!serviceTypeCode) {
        throw new Error('ServiceType code is required');
      }
      try {
        const tx = cds.tx(req);
        const serviceType = await tx.run(SELECT.one.from(ServiceType).where({ serviceTypeCode: serviceTypeCode }));
        console.log('ServiceType response by ID:', JSON.stringify(serviceType));
        return serviceType;
      } catch (error) {
        console.error('Error in READ ServiceType by ID:', error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
    });

    this.on('CREATE', ServiceType, async (req) => {
      console.log('Executing CREATE for new ServiceType');
      const newServiceType = req.data;
      try {
        const tx = cds.tx(req);
        const created = await tx.run(INSERT.into(ServiceType).entries(newServiceType));
        console.log('Created ServiceType:', JSON.stringify(created));
        await tx.commit();
        return created;
      } catch (error) {
        console.error('Error in CREATE ServiceType:', error.message);
        await tx.rollback();
        throw new Error(`Database insert failed: ${error.message}`);
      }
    });

    this.on('DELETE', ServiceType, async (req) => {
      console.log('Executing DELETE for ServiceType');
      const serviceTypeCode = req.params[0]?.serviceTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'serviceTypeCode')?.val;
      if (!serviceTypeCode) {
        throw new Error('ServiceType code is required');
      }
      try {
        const tx = cds.tx(req);
        const deleted = await tx.run(DELETE.from(ServiceType).where({ serviceTypeCode: serviceTypeCode }));
        console.log('Deleted ServiceType:', JSON.stringify(deleted));
        await tx.commit();
        return { success: true };
      } catch (error) {
        console.error('Error in DELETE ServiceType:', error.message);
        await tx.rollback();
        throw new Error(`Database delete failed: ${error.message}`);
      }
    });

    this.on('UPDATE', ServiceType, async (req) => {
      console.log('Executing UPDATE for ServiceType');
      const serviceTypeCode = req.params[0]?.serviceTypeCode || req.query.SELECT.where?.find(w => w.ref?.[0] === 'serviceTypeCode')?.val;
      if (!serviceTypeCode) {
        throw new Error('ServiceType code is required');
      }
      try {
        const tx = cds.tx(req);
        const updated = await tx.run(UPDATE(ServiceType).with(req.data).where({ serviceTypeCode: serviceTypeCode }));
        console.log('Updated ServiceType:', JSON.stringify(updated));
        await tx.commit();
        return updated;
      } catch (error) {
        console.error('Error in UPDATE ServiceType:', error.message);
        await tx.rollback();
        throw new Error(`Database update failed: ${error.message}`);
      }
    });
  }
  // === GET /formulas
  this.on('READ', Formulas, async (req) => {
    debugger
    if (req.data.formulaCode) {
      // find by id
      return SELECT.one.from(Formulas).where({ formulaCode: req.data.formulaCode })
    }
    // return all
    return SELECT.from(Formulas)
  })

  // === POST /formulas
  this.on('CREATE', Formulas, async (req) => {
    const data = req.data
    const inserted = await INSERT.into(Formulas).entries(data)
    return inserted
  })

  // === DELETE /formulas/{formulaCode}
  this.on('DELETE', Formulas, async (req) => {
    const { formulaCode } = req.data
    return DELETE.from(Formulas).where({ formulaCode })
  })

  // === PATCH /formulas/{formulaCode}
  this.on('UPDATE', Formulas, async (req) => {
    const { formulaCode, ...rest } = req.data
    return UPDATE(Formulas).set(rest).where({ formulaCode })
  })

  // === GET /formulas/search?keyword=...
  this.on('searchFormulas', async (req) => {
    const { keyword } = req.data
    return SELECT.from(Formulas).where({
      description: { like: `%${keyword}%` }  // assuming Formula has a 'description' field
    })
  })
  // === GET /ModelSpecifications (all or by ID)
  this.on('READ', ModelSpecifications, async (req) => {
    const { modelSpecCode } = req.data;

    if (modelSpecCode) {
      return await SELECT
        .from(ModelSpecifications, s => {
          s('*', s.modelSpecificationsDetails('*'));
        })
        .where({ modelSpecCode });
    }

    return await SELECT
      .from(ModelSpecifications, s => {
        s('*', s.modelSpecificationsDetails('*'));
      });
  });
  // === POST /ModelSpecifications
  this.on('CREATE', ModelSpecifications, async (req) => {
    const data = req.data;

    try {
      // 1️⃣ Extract child records (details)
      const { modelSpecificationsDetails, ...parentData } = data;

      // 2️⃣ Insert parent record
      const insertedParent = await INSERT.into(ModelSpecifications).entries(parentData);

      // 3️⃣ Insert details if provided
      if (Array.isArray(modelSpecificationsDetails) && modelSpecificationsDetails.length > 0) {
        for (const detail of modelSpecificationsDetails) {
          detail.modelSpecifications_modelSpecCode = parentData.modelSpecCode; // FK reference
          await INSERT.into(ModelSpecificationsDetails).entries(detail);
        }
      }

      // 4️⃣ Query full record back (with children)
      const result = await SELECT
        .from(ModelSpecifications, s => {
          s('*', s.modelSpecificationsDetails('*'));
        })
        .where({ modelSpecCode: parentData.modelSpecCode });

      return result;

    } catch (err) {
      console.error('Error creating ModelSpecifications:', err);
      req.error(500, err.message);
    }
  });
  this.on('UPDATE', ModelSpecifications, async (req) => {
    const { modelSpecCode, ...rest } = req.data;
    return await UPDATE(ModelSpecifications).set(rest).where({ modelSpecCode });
  });
  this.on('DELETE', ModelSpecifications, async (req) => {
    const { modelSpecCode } = req.data;

    await DELETE.from(ModelSpecificationsDetails).where({
      modelSpecifications_modelSpecCode: modelSpecCode
    });

    return await DELETE.from(ModelSpecifications).where({ modelSpecCode });
  });
  this.on('searchModelSpecifications', async (req) => {
    const { keyword } = req.data;

    return await SELECT
      .from(ModelSpecifications, s => {
        s('*', s.modelSpecificationsDetails('*'));
      })
      .where({ description: { like: `%${keyword}%` } });
  });


  // === READ /ModelSpecificationsDetails (All or by ID)
  this.on('READ', ModelSpecificationsDetails, async (req) => {
    const { modelSpecDetailsCode } = req.data;

    if (modelSpecDetailsCode) {
      // Single record by primary key
      return await SELECT
        .from(ModelSpecificationsDetails, d => {
          d('*', d.modelSpecifications('*'));
        })
        .where({ modelSpecDetailsCode });
    }

    // FIX: The previous implementation ignored req.query.SELECT.where entirely,
    // so any OData $filter sent by the client (e.g.
    //   ?$filter=modelSpecifications_modelSpecCode eq 1772752199
    // ) was silently discarded and ALL details from every model were returned.
    // Now we pass the parsed WHERE clause through so only the requested model's
    // services are returned.
    const q = SELECT.from(ModelSpecificationsDetails, d => {
      d('*', d.modelSpecifications('*'));
    });

    const where = req.query && req.query.SELECT && req.query.SELECT.where;
    if (where && where.length) {
      return await q.where(where);
    }

    return await q;
  });
  // === CREATE /ModelSpecificationsDetails
  this.before('CREATE', ModelSpecificationsDetails, async (req) => {
    const max = await SELECT.one.from(ModelSpecificationsDetails).columns('max(modelSpecDetailsCode) as max');
    req.data.modelSpecDetailsCode = (max?.max || 0) + 1;

    if (!req.data.modelSpecifications_modelSpecCode && req.data.up__modelSpecCode) {
      req.data.modelSpecifications_modelSpecCode = req.data.up__modelSpecCode;
    }
  });

  this.on('CREATE', ModelSpecificationsDetails, async (req) => {
    const data = req.data;

    try {
      if (!data.modelSpecifications_modelSpecCode) {
        return req.error(400, 'Parent modelSpecifications_modelSpecCode is required.');
      }

      await INSERT.into(ModelSpecificationsDetails).entries(data);

      const result = await SELECT
        .from(ModelSpecificationsDetails, d => {
          d('*', d.modelSpecifications('*'));
        })
        .where({ modelSpecDetailsCode: data.modelSpecDetailsCode });

      return result;

    } catch (err) {
      console.error("❌ Error creating ModelSpecificationsDetails:", err);
      req.error(500, err.message);
    }
  });
  // === UPDATE /ModelSpecificationsDetails/{modelSpecDetailsCode}
  this.on('UPDATE', ModelSpecificationsDetails, async (req) => {
    const { modelSpecDetailsCode, ...rest } = req.data;
    return await UPDATE(ModelSpecificationsDetails).set(rest).where({ modelSpecDetailsCode });
  });
  // === DELETE /ModelSpecificationsDetails/{modelSpecDetailsCode}
  this.on('DELETE', ModelSpecificationsDetails, async (req) => {
    const { modelSpecDetailsCode } = req.data;
    return await DELETE.from(ModelSpecificationsDetails).where({ modelSpecDetailsCode });
  });
  // === SEARCH /ModelSpecificationsDetails/search
  this.on('searchModelSpecDetails', async (req) => {
    const { keyword } = req.data;

    return await SELECT
      .from(ModelSpecificationsDetails, d => {
        d('*', d.modelSpecifications('*'));
      })
      .where({
        or: [
          { shortText: { like: `%${keyword}%` } },
          { serviceText: { like: `%${keyword}%` } }
        ]
      });
  });




  // Get all
  this.on('READ', 'InvoiceMainItem', async (req) => {
    return await SELECT.from(InvoiceMainItems);
  });

  // Fetch by referenceId
  this.on('fetchByReferenceId', async (req) => {
    const { referenceId } = req.data;
    return await SELECT.from(InvoiceMainItems).where({ referenceId });
  });

  // Calculate total for one item
  this.on('calculateTotal', async (req) => {
    const { invoiceMainItemCode } = req.data;
    const item = await SELECT.one.from(InvoiceMainItems).where({ invoiceMainItemCode });

    if (!item) return 0;

    const base = Number(item.quantity) * Number(item.amountPerUnit);
    const profit = (base * Number(item.profitMargin)) / 100;
    return base + profit;
  });

  // Calculate total header
  this.on('calculateTotalHeader', async () => {
    const all = await SELECT.from(InvoiceMainItems);
    let total = 0;
    for (const i of all) {
      const base = Number(i.quantity) * Number(i.amountPerUnit);
      const profit = (base * Number(i.profitMargin)) / 100;
      total += base + profit;
    }
    return total;
  });

  // Search keyword in referenceId or salesQuotation
  this.on('search', async (req) => {
    const { keyword } = req.data;
    return await SELECT.from(InvoiceMainItems).where(
      { referenceId: { like: `%${keyword}%` } }
    );
  });

  // Create or Update
  this.before('CREATE', 'InvoiceMainItems', async (req) => {
    if (!req.data.invoiceMainItemCode) {
      // generate unique ID
      const max = await SELECT.one.from(InvoiceMainItems).columns('max(invoiceMainItemCode) as max');
      req.data.invoiceMainItemCode = (max?.max || 0) + 1;
    }
  });



  // GET /servicenumbers
  this.on('READ', ServiceNumbers, async (req) => {
    const existingServiceNumbers = await SELECT.from(ServiceNumbers);
    const existingCodes = new Set(existingServiceNumbers.map(sn => sn.serviceNumberCode));
    return SELECT.from(ServiceNumbers); // return updated list
  });

  // POST /servicenumbers
  this.on('CREATE', ServiceNumbers, async (req) => {
    return await INSERT.into(ServiceNumbers).entries(req.data);
  });

  // PATCH /servicenumbers/{id}
  this.on('UPDATE', ServiceNumbers, async (req) => {
    return await UPDATE(ServiceNumbers)
      .set(req.data)
      .where({ serviceNumberCode: req.data.serviceNumberCode });
  });

  // DELETE /servicenumbers/{id}
  this.on('DELETE', ServiceNumbers, async (req) => {
    return await DELETE.from(ServiceNumber).where({ serviceNumberCode: req.data.serviceNumberCode });
  });

  // Custom action for search
  this.on('searchServiceNumber', async (req) => {
    const keyword = req.data.keyword;
    return await SELECT.from(ServiceNumbers).where({
      description: { like: `%${keyword}%` }
    });
  });


  //#endregion 


  /*-------------------------------------------------------------------------*/

  /**
     * Read SalesQuotation (header)
     */
  // this.on('READ', SalesQuotations, async (req) => {
  //   try {
  //     const url = `https://my405604-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?$top=20&$format=json`;

  //     const response = await axios.get(url, {
  //       headers: {
  //         'Authorization': authHeader,
  //         'Accept': 'application/json'
  //       }
  //     });

  //     return response.data.d.results.map(h => ({
  //       SalesQuotation: h.SalesQuotation,
  //       SalesOrganization: h.SalesOrganization,
  //       DistributionChannel: h.DistributionChannel,
  //       Division: h.Division,
  //       SalesQuotationType: h.SalesQuotationType,
  //       SalesQuotationDate: h.SalesQuotationDate,
  //       SoldToParty: h.SoldToParty,
  //       TransactionCurrency: h.TransactionCurrency,
  //       TotalNetAmount: h.TotalNetAmount
  //     }));

  //   } catch (err) {
  //     console.error('Error fetching Sales Quotation:', err.message);
  //     req.error(500, `Failed to fetch Sales Quotation: ${err.message}`);
  //   }
  // });

  /**
   * Read SalesQuotationItem (items for a given quotation)
   */
  // this.on('READ', SalesQuotationItem, async (req) => {
  //   try {
  //     const { SalesQuotation } = req.query.SELECT.where?.reduce((acc, cur, i, arr) => {
  //       if (cur.ref?.[0] === 'SalesQuotation') acc.SalesQuotation = arr[i + 2].val;
  //       return acc;
  //     }, {}) || {};

  //     if (!SalesQuotation) {
  //       return []; // no filter → skip
  //     }

  //     const url = `https://my405604-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem?$filter=SalesQuotation eq '${SalesQuotation}'&$format=json`;

  //     const response = await axios.get(url, {
  //       headers: {
  //         'Authorization': authHeader,
  //         'Accept': 'application/json'
  //       }
  //     });

  //     return response.data.d.results.map(i => ({
  //       SalesQuotation: i.SalesQuotation,
  //       SalesQuotationItem: i.SalesQuotationItem,
  //       Material: i.Material,
  //       RequestedQuantity: i.RequestedQuantity,
  //       RequestedQuantityUnit: i.RequestedQuantityUnit,
  //       NetAmount: i.NetAmount
  //     }));

  //   } catch (err) {
  //     console.error('Error fetching Sales Quotation Item:', err.message);
  //     req.error(500, `Failed to fetch Sales Quotation Item: ${err.message}`);
  //   }
  // });





  // this.on('getSalesQuotationItemById', async (req) => {
  //   const { salesQuotation, salesQuotationItem } = req.data

  //   // Build S/4 API URL
  //   const url = `https://my405604-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='${salesQuotation}',SalesQuotationItem='${salesQuotationItem}')/to_SalesQuotation`

  //   try {
  //     // Basic Auth
  //     const user = process.env.S4_USER || "BTP_USER1"
  //     const password = process.env.S4_PASS || "Gw}tDHMrhuAWnzRWkwEbpcguYKsxugDuoKMeJ8Lt"

  //     const response = await axios.get(url, {
  //       auth: { username: user, password: password },
  //       headers: { "Accept": "application/json" }
  //     })

  //     return {
  //       salesQuotation,
  //       salesQuotationItem,
  //       response: JSON.stringify(response.data) // returning raw JSON payload
  //     }

  //   } catch (error) {
  //     console.error("Error calling S/4 API:", error.message)
  //     req.error(500, `Failed to fetch SalesQuotationItem: ${error.message}`)
  //   }
  // })


  /**
   * GET /mainitems/{salesQuotation}/{salesQuotationItem}
   * Calls S/4HANA OData API
   */
  this.on('getSalesQuotationItemById', async (req) => {
    const { salesQuotation, salesQuotationItem } = req.data;

    const url =
      `https://my405604-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV` +
      `/A_SalesQuotationItem(SalesQuotation='${salesQuotation}',SalesQuotationItem='${salesQuotationItem}')/to_SalesQuotation`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from('BTP_USER1:Gw}tDHMrhuAWnzRWkwEbpcguYKsxugDuoKMeJ8Lt').toString('base64'),
          Accept: 'application/json',
        },
      });

      return JSON.stringify(response.data); // matches Java's StringBuilder
    } catch (e) {
      req.error(500, `Failed to fetch from S/4HANA: ${e.message}`);
    }
  });

  /**
   * GET /mainitems/referenceid?referenceId=...
   * Looks up invoice items locally
   */
  this.on('getInvoiceMainItemsByReferenceId', async (req) => {
    const { referenceId } = req.data;

    // Query local db table
    const items = await SELECT.from(InvoiceMainItems).where({ referenceId });

    if (!items.length) {
      req.error(404, `No items found for referenceId=${referenceId}`);
    }

    return items;
  });
  console.log('Handler initialized for SalesOrderCloudService');

  async function fetchCsrfToken(tokenUrl, cookies = '') {
    console.log(`Fetching CSRF token from ${tokenUrl}`);
    try {
      const res = await axios.get(tokenUrl, {
        headers: { 'Authorization': authHeader, 'x-csrf-token': 'Fetch', 'Accept': 'application/json', 'Cookie': cookies },
        timeout: 10000
      });
      return { token: res.headers['x-csrf-token'], cookies: res.headers['set-cookie']?.join('; ') || cookies };
    } catch (error) {
      console.error(`CSRF fetch error: ${error.message}, Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Failed to fetch CSRF token: ${error.message}`);
    }
  }


  this.on('READ', 'SalesOrders', async (req) => {
    console.log('Executing READ for SalesOrders');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$inlinecount=allpages';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrders:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesOrderItems', async (req) => {
    console.log('Executing READ for SalesOrderItems');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem?$inlinecount=allpages&$';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrderItems:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesOrderItemsById', async (req) => {
    console.log('Executing READ for SalesOrderItemsById');
    const salesOrderID = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesOrderID')?.val || req.query.SELECT.where?.find(w => w.val)?.val || 'defaultID';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${salesOrderID}')/to_Item?$inlinecount=allpages&$`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrderItemsById:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesOrderPricingElement', async (req) => {
    console.log('Executing READ for SalesOrderPricingElement');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItemPrElement?$inlinecount=allpages&$';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrderPricingElement:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesOrderByItem', async (req) => {
    console.log('Executing READ for SalesOrderByItem');
    const salesOrder = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesOrder')?.val || 'defaultSalesOrder';
    const salesOrderItem = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesOrderItem')?.val || 'defaultItem';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${salesOrderItem}')`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrderByItem:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesOrderPricing', async (req) => {
    console.log('Executing READ for SalesOrderPricing');
    const salesOrder = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesOrder')?.val || 'defaultSalesOrder';
    const salesOrderItem = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesOrderItem')?.val || 'defaultItem';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${salesOrderItem}')/to_PricingElement?$inlinecount=allpages&$`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesOrderPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'SalesQuotation', async (req) => {
    console.log('Executing READ for SalesQuotation');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?$inlinecount=allpages&$';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesQuotation:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });

  // this.on('READ', 'SalesQuotation', async (req) => {
  //   const { SalesQuotation } = req.data;  // key passed when selecting one entity

  //   let url;
  // // var SalesQuotation = '20000001';
  //   if (SalesQuotation) {
  //     // Fetch single quotation WITH items
  //     url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation('${SalesQuotation}')?$expand=to_Item`;
  //   console.log(url);

  //   } else {
  //     // Fetch all quotations (headers only)
  //     url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?$format=json`;
  //   }
  // console.log(url);

  //   try {
  //     const res = await axios.get(url, {
  //       headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  //       timeout: 10000
  //     });

  //     if (SalesQuotation) {
  //       const header = res.data.d; // single record
  //       // Map items inline
  //       header.items = header.to_Item?.results || [];
  //       delete header.to_Item;
  //       return header;
  //     } else {
  //       return res.data.d?.results || [];
  //     }

  //   } catch (error) {
  //     console.error('Error in READ SalesQuotation:', error.message, 'Status:', error.response?.status);
  //     req.error(500, `S/4HANA call failed: ${error.message}`);
  //   }
  // });

  // this.on('READ',SalesQuotationItem, async (req) => {
  //   console.log('Executing READ for SalesQuotationItem');
  //   var salesQuotationID = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesQuotationID')?.val || 'defaultID';
  //   console.log(salesQuotationID);
  //   salesQuotationID = 20000000;
  //   const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation('${salesQuotationID}')/to_Item?$inlinecount=allpages&$`;
  //   try {
  //     console.log(`Calling S/4HANA: ${url}`);
  //     const res = await axios.get(url, {
  //       headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  //       timeout: 10000
  //     });
  //     console.log('S/4HANA response:', JSON.stringify(res.data));
  //     return res.data.d?.results || [];
  //   } catch (error) {
  //     console.error('Error in READ SalesQuotationItem:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
  //     throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
  //   }
  // });
  // --- new API for SalesQuotationItem -> to_SalesQuotation ---
  // this.on('getRelatedSalesQuotation', async (req) => {
  //   console.log('ssssssssssssssssss');

  //   const { SalesQuotation, SalesQuotationItem } = req.data;
  //   console.log(`Fetching SalesQuotation for Item: ${SalesQuotation}/${SalesQuotationItem}`);

  //   const url = `https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='${SalesQuotation}',SalesQuotationItem='${SalesQuotationItem}')/to_SalesQuotation`;

  //   try {
  //     console.log(`Calling S/4HANA: ${url}`);
  //     const res = await axios.get(url, {
  //       headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  //       timeout: 10000
  //     });

  //     console.log('S/4HANA response:', JSON.stringify(res.data));
  //     return res.data.d || {};
  //   } catch (error) {
  //     console.error('Error in getRelatedSalesQuotation:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
  //     throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
  //   }
  // });

  this.on('READ', 'SalesQuotationItem', async (req) => {
    const { SalesQuotation } = req.data;
    // var SalesQuotation = 20000001;
    if (!SalesQuotation) return [];

    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation('${SalesQuotation}')/to_Item`;

    try {
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });

      return res.data.d?.results || [];

    } catch (error) {
      console.error('Error in READ SalesQuotationItem:', error.message, 'Status:', error.response?.status);
      req.error(500, `S/4HANA call failed: ${error.message}`);
    }
  });

  // this.on('READ', 'SalesQuotationItem', async (req) => {
  //   console.log('Executing READ for SalesQuotationItems');
  //   const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem?$inlinecount=allpages&$';
  //   try {
  //     console.log(`Calling S/4HANA: ${url}`);
  //     const res = await axios.get(url, {
  //       headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  //       timeout: 10000
  //     });
  //     console.log('S/4HANA response:', JSON.stringify(res.data));
  //     return res.data.d?.results || [];
  //   } catch (error) {
  //     console.error('Error in READ SalesQuotationItems:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
  //     throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
  //   }
  // });


  this.on('READ', 'SalesQuotationPricing', async (req) => {
    console.log('Executing READ for SalesQuotationPricing');
    const salesQuotation = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesQuotation')?.val || 'defaultSalesQuotation';
    const salesQuotationItem = req.query.SELECT.where?.find(w => w.ref?.[0] === 'SalesQuotationItem')?.val || 'defaultItem';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='${salesQuotation}',SalesQuotationItem='${salesQuotationItem}')/to_PricingElement?$inlinecount=allpages&$`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ SalesQuotationPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'DebitMemo', async (req) => {
    console.log('Executing READ for DebitMemo');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest?$inlinecount=allpages&$';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ DebitMemo:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'DebitMemoPricing', async (req) => {
    console.log('Executing READ for DebitMemoPricing');
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoReqItemPrcgElmnt?$inlinecount=allpages&$';
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ DebitMemoPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'DebitMemoRequestItems', async (req) => {
    console.log('Executing READ for DebitMemoRequestItems');
    const debitMemoRequest = req.query.SELECT.where?.find(w => w.ref?.[0] === 'DebitMemoRequest')?.val || 'defaultID';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest('${debitMemoRequest}')/to_Item?$inlinecount=allpages&$`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ DebitMemoRequestItems:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('READ', 'DebitMemoRequestByItem', async (req) => {
    console.log('Executing READ for DebitMemoRequestByItem');
    const debitMemoRequest = req.query.SELECT.where?.find(w => w.ref?.[0] === 'DebitMemoRequest')?.val || 'defaultDebitMemoRequest';
    const debitMemoRequestItem = req.query.SELECT.where?.find(w => w.ref?.[0] === 'DebitMemoRequestItem')?.val || 'defaultItem';
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequestItem(DebitMemoRequest='${debitMemoRequest}',DebitMemoRequestItem='${debitMemoRequestItem}')`;
    try {
      console.log(`Calling S/4HANA: ${url}`);
      const res = await axios.get(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data.d?.results || [];
    } catch (error) {
      console.error('Error in READ DebitMemoRequestByItem:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('postSalesOrder', async (req) => {
    console.log('Executing postSalesOrder');
    const { body } = req.data;
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001/SalesOrder';
    const tokenUrl = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?';
    try {
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      const res = await axios.post(url, body, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in postSalesOrder:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('postSalesQuotation', async (req) => {
    console.log('Executing postSalesQuotation');
    const { body } = req.data;
    const url = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation';
    const tokenUrl = 'https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotation?$inlinecount=allpages&$';
    try {
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      const res = await axios.post(url, body, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in postSalesQuotation:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('postSalesOrderItemPricing', async (req) => {
    console.log('Executing postSalesOrderItemPricing');
    const { SalesOrder, SalesOrderItem, body } = req.data;
    const tokenUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${SalesOrder}',SalesOrderItem='${SalesOrderItem}')/to_PricingElement`;
    const postUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001/SalesOrderItem/${SalesOrder}/${SalesOrderItem}/_ItemPricingElement`;
    try {
      // Step 1: Fetch totalHeader (simulated, replace with actual logic)
      const totalHeader = 100.0; // Placeholder; replace with actual getExcOrderWithTotalHeader logic
      let modifiedBody = body;
      if (totalHeader) {
        // Simulate JSON modification (requires a JSON parser, e.g., 'json-parse' or 'fast-json-parse')
        const bodyJson = JSON.parse(body);
        bodyJson.ConditionRateValue = totalHeader; // Adjust based on API field name
        modifiedBody = JSON.stringify(bodyJson);
      }
      // Step 2: Fetch CSRF token
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      // Step 3: Send POST request
      const res = await axios.post(postUrl, modifiedBody, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in postSalesOrderItemPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('patchSalesQuotationItemPricing', async (req) => {
    console.log('Executing patchSalesQuotationItemPricing');
    const { SalesQuotation, SalesQuotationItem, PricingProcedureStep, PricingProcedureCounter, body } = req.data;
    const tokenUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='${SalesQuotation}',SalesQuotationItem='${SalesQuotationItem}')/to_PricingElement?%24inlinecount=allpages&%24top=50`;
    const patchUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_QUOTATION_SRV/A_SalesQuotationItemPrcgElmnt(SalesQuotation='${SalesQuotation}',SalesQuotationItem='${SalesQuotationItem}',PricingProcedureStep='${PricingProcedureStep}',PricingProcedureCounter='${PricingProcedureCounter}')`;
    try {
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      const res = await axios.post(patchUrl, body, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'X-HTTP-Method-Override': 'PATCH',
          'If-Match': '*',
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in patchSalesQuotationItemPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('patchSalesOrderItemPricing', async (req) => {
    console.log('Executing patchSalesOrderItemPricing');
    const { SalesOrder, SalesOrderItem, PricingProcedureStep, PricingProcedureCounter, body } = req.data;
    const tokenUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${SalesOrder}',SalesOrderItem='${SalesOrderItem}')/to_PricingElement?%24inlinecount=allpages&%24top=50`;
    const patchUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItemPrElement(SalesOrder='${SalesOrder}',SalesOrderItem='${SalesOrderItem}',PricingProcedureStep='${PricingProcedureStep}',PricingProcedureCounter='${PricingProcedureCounter}')`;
    try {
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      const res = await axios.post(patchUrl, body, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'X-HTTP-Method-Override': 'PATCH',
          'If-Match': '*',
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in patchSalesOrderItemPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });


  this.on('patchDebitMemoItemPricing', async (req) => {
    console.log('Executing patchDebitMemoItemPricing');
    const { DebitMemoRequest, DebitMemoRequestItem, PricingProcedureStep, PricingProcedureCounter, body } = req.data;
    const tokenUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest`;
    const patchUrl = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoReqItemPrcgElmnt(DebitMemoRequest='${DebitMemoRequest}',DebitMemoRequestItem='${DebitMemoRequestItem}',PricingProcedureStep='${PricingProcedureStep}',PricingProcedureCounter='${PricingProcedureCounter}')`;
    try {
      const { token, cookies } = await fetchCsrfToken(tokenUrl);
      if (!token) throw new Error('Failed to fetch CSRF token');
      const res = await axios.post(patchUrl, body, {
        headers: {
          'Authorization': authHeader,
          'x-csrf-token': token,
          'X-HTTP-Method-Override': 'PATCH',
          'If-Match': '*',
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        timeout: 10000
      });
      console.log('S/4HANA response:', JSON.stringify(res.data));
      return res.data || 'Success';
    } catch (error) {
      console.error('Error in patchDebitMemoItemPricing:', error.message, 'Status:', error.response?.status, 'Data:', JSON.stringify(error.response?.data));
      throw new Error(`S/4HANA call failed: ${error.message} (Status: ${error.response?.status || 500})`);
    }
  });

  //--------------------------------------------------------------------------------------------------

  // const { Currency, LineType, MaterialGroup, PersonnelNumber, UnitOfMeasurement, ServiceType } = this.entities;

  console.log('Entities loaded:', Object.keys(this.entities)); // Debug entity binding



  // // READ all invoices
  // this.on('READ', ServiceInvoiceMains, async (req) => {
  //   return SELECT.from(ServiceInvoiceMains);
  // });

  // // DELETE
  // this.on('DELETE', ServiceInvoiceMains, async (req) => {
  //   const { serviceInvoiceCode } = req.data;
  //   return await DELETE.from(ServiceInvoiceMains).where({ serviceInvoiceCode });
  // });

  // // PATCH / UPDATE
  // this.on('UPDATE', ServiceInvoiceMains, async (req) => {
  //   const { serviceInvoiceCode, ...data } = req.data;
  //   return await UPDATE(ServiceInvoiceMains).set(data).where({ serviceInvoiceCode });
  // });

  // // ACTION: calculateTotalHeader
  // this.on('calculateTotalHeaderServiceInvoice', async () => {
  //   const items = await SELECT.from(ServiceInvoiceMains);
  //   const total = items.reduce((sum, item) => sum + (item.total || 0), 0);
  //   return total;
  // });

  // // ACTION: calculateTotal
  // this.on('calculateTotalServiceInvoice', async (req) => {
  //   const { serviceInvoiceCode } = req.data;
  //   const invoice = await SELECT.one.from(ServiceInvoiceMains).where({ serviceInvoiceCode });
  //   if (!invoice) return 0;
  //   return invoice.quantity * invoice.amountPerUnit;
  // });

  // // ACTION: calculateQuantities
  // this.on('calculateQuantitiesServiceInvoice', async (req) => {
  //   const newInv = req.data;

  //   // Fetch all previous invoices for this executionOrderMainCode
  //   const prevInvoices = await SELECT.from(ServiceInvoiceMains).where({ executionOrderMainCode: newInv.executionOrderMainCode });

  //   const latestActualQuantity = prevInvoices.length
  //     ? Math.max(...prevInvoices.map(inv => inv.actualQuantity || 0))
  //     : 0;

  //   let newActualQuantity = latestActualQuantity + newInv.quantity;

  //   // Validation logic
  //   if (!newInv.unlimitedOverFulfillment) {
  //     if (newInv.overFulfillmentPercentage && newInv.overFulfillmentPercentage > 0) {
  //       const maxAllowed = newInv.totalQuantity + newInv.overFulfillmentPercentage;
  //       if (newActualQuantity > maxAllowed) {
  //         req.error(400, `Quantity exceeds the allowed over-fulfillment limit of ${newInv.overFulfillmentPercentage}`);
  //       }
  //     } else {
  //       if (newActualQuantity > newInv.totalQuantity) {
  //         req.error(400, 'Quantity exceeds the total allowed quantity.');
  //       }
  //     }
  //   }

  //   // Set recalculated fields
  //   newInv.actualQuantity = newActualQuantity;
  //   newInv.remainingQuantity = Math.max(newInv.totalQuantity - newInv.actualQuantity, 0);
  //   newInv.total = newInv.quantity * newInv.amountPerUnit;

  //   const latestTotalHeader = prevInvoices.length
  //     ? Math.max(...prevInvoices.map(inv => inv.totalHeader || 0))
  //     : 0;
  //   newInv.totalHeader = latestTotalHeader + newInv.total;

  //   newInv.actualPercentage = Math.floor((newInv.actualQuantity / newInv.totalQuantity) * 100);

  //   await INSERT.into(ServiceInvoiceMains).entries(newInv);

  //   return newInv;
  // });

  // // ACTION: findByReferenceId
  // this.on('findByReferenceIdServiceInvoice', async (req) => {
  //   return await SELECT.from(ServiceInvoiceMains).where({ referenceId: req.data.referenceId });
  // });

  // // ACTION: findByLineNumber
  // this.on('findByLineNumberServiceInvoice', async (req) => {
  //   return await SELECT.from(ServiceInvoiceMains).where({ lineNumber: req.data.lineNumber });
  // });


  // READ all subitems
  this.on('READ', InvoiceSubItems, async () => {
    return await SELECT.from(InvoiceSubItems);
  });

  // CREATE subitem
  this.on('CREATE', InvoiceSubItems, async (req) => {
    const data = req.data;
    await INSERT.into(InvoiceSubItems).entries(data);
    return data;
  });

  // DELETE subitem
  this.on('DELETE', InvoiceSubItems, async (req) => {
    const { subItemCode } = req.data;
    return await DELETE.from(InvoiceSubItems).where({ subItemCode });
  });

  // UPDATE (PATCH)
  this.on('UPDATE', InvoiceSubItems, async (req) => {
    const { subItemCode, ...data } = req.data;
    return await UPDATE(InvoiceSubItems).set(data).where({ subItemCode });
  });

  // ACTION: findBySubItemCode
  this.on('findBySubItemCode', async (req) => {
    const { subItemCode } = req.data;
    return await SELECT.one.from(InvoiceSubItems).where({ subItemCode });
  });

  // ACTION: search
  this.on('search', async (req) => {
    const { keyword } = req.data;
    return await SELECT.from(InvoiceSubItems).where({
      description: { like: `%${keyword}%` }
    });
  });





  // Get all sales orders
  this.on('getAllSalesOrders', async () => {
    const res = await client.get(`/A_SalesOrder?$inlinecount=allpages&$top=50`);
    return JSON.stringify(res.data);
  });

  // Get all sales order items
  this.on('getAllSalesOrderItems', async () => {
    const res = await client.get(`/A_SalesOrderItem?$inlinecount=allpages&$top=50`);
    return JSON.stringify(res.data);
  });

  // Get items of a given SalesOrder
  this.on('getSalesOrderItems', async req => {
    const { SalesOrderID } = req.data;
    const res = await client.get(`/A_SalesOrder('${SalesOrderID}')/to_Item?$inlinecount=allpages&$top=50`);
    return JSON.stringify(res.data);
  });

  // Get specific SalesOrderItem
  this.on('getSalesOrderItem', async req => {
    const { SalesOrder, SalesOrderItem } = req.data;
    const res = await client.get(`/A_SalesOrderItem(SalesOrder='${SalesOrder}',SalesOrderItem='${SalesOrderItem}')/to_SalesOrder`);
    return JSON.stringify(res.data);
  });

  // Get pricing elements
  this.on('getSalesOrderPricingElements', async () => {
    const res = await client.get(`/A_SalesOrderItemPrElement?$inlinecount=allpages&$top=50`);
    return JSON.stringify(res.data);
  });


  // // Unit Of Measurement Cloud
  // this.on('READ', 'UnitOfMeasurements', async (req) => {
  //   console.log("Fetching UnitOfMeasurements from S/4...")

  //   const url = "https://my405604-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_UOM4_CDS/YY1_UOM4?$format=json"

  //   try {
  //     const user = process.env.UOM_USER || "UOM_USER4"
  //     const password = process.env.UOM_PASS || "s3ZhGnQXEymrUcgCPXR\\ZBPgDAeKYbxLEaozZQPv"

  //     const response = await axios.get(url, {
  //       auth: { username: user, password: password },
  //       headers: { Accept: "application/json" }
  //     })

  //     const results = response.data.d?.results || []

  //     // filter to English
  //     const filtered = results.filter(r => r.LanguageISOCode === 'EN')

  //     // make unique by UnitOfMeasure
  //     const uniqueMap = new Map()
  //     filtered.forEach(r => {
  //       if (!uniqueMap.has(r.UnitOfMeasure)) {
  //         uniqueMap.set(r.UnitOfMeasure, {
  //           code: r.UnitOfMeasure,
  //           description: r.UnitOfMeasureLongName || r.UnitOfMeasureName
  //         })
  //       }
  //     })

  //     // return as array
  //     return Array.from(uniqueMap.values())

  //   } catch (e) {
  //     console.error("Failed to fetch UOM data:", e)
  //     req.error(500, `Failed to fetch UOM data: ${e.message}`)
  //   }
  // })

  // ==================== READ - UnitOfMeasurements ====================
  this.on('READ', 'UnitOfMeasurements', async (req) => {
    console.log("✅ Fetching UnitOfMeasurements from local DB...");

    try {
      const tx = cds.transaction(req);

      // Use full qualified name
      const result = await tx.run(
        SELECT.from('salesdb.UnitOfMeasurement')
          .columns('code', 'description')
      );

      console.log(`✅ Fetched ${result.length} UnitOfMeasurements`);
      return result;

    } catch (error) {
      console.error("❌ Error fetching UnitOfMeasurements:", error);
      req.error(500, `Failed to fetch UnitOfMeasurements: ${error.message}`);
    }
  });

  // ==================== CREATE - Standard POST ====================
  this.before('CREATE', 'UnitOfMeasurements', async (req) => {
    const { code, description } = req.data;

    // Validations
    if (!code || !description) {
      req.error(400, 'Code and Description are mandatory');
    }

    // Normalize code to uppercase
    const normalizedCode = code.trim().toUpperCase();
    req.data.code = normalizedCode;
    req.data.description = description.trim();

    const tx = cds.transaction(req);

    // Check for duplicates
    const existing = await tx.run(
      SELECT.one.from('salesdb.UnitOfMeasurement').where({ code: normalizedCode })
    );

    if (existing) {
      req.error(409, `Unit of Measurement '${normalizedCode}' already exists`);
    }

    // Add UUID for DB entity
    req.data.unitOfMeasurementCode = cds.utils.uuid();
  });

  this.after('CREATE', 'UnitOfMeasurements', (data) => {
    console.log(`✅ Created UoM: ${data.code} - ${data.description}`);
  });

  // ==================== Action: postUnitOfMeasurement ====================
  this.on('postUnitOfMeasurement', async (req) => {
    const { code, description } = req.data;

    if (!code || !description) {
      return req.error(400, 'Code and Description are mandatory');
    }

    const normalizedCode = code.trim().toUpperCase();
    const tx = cds.transaction(req);

    try {
      // Check for duplicates
      const existing = await tx.run(
        SELECT.one.from('salesdb.UnitOfMeasurement').where({ code: normalizedCode })
      );

      if (existing) {
        return req.error(409, `Unit of Measurement '${normalizedCode}' already exists`);
      }

      // Create the record with UUID
      const newUoM = {
        unitOfMeasurementCode: cds.utils.uuid(),
        code: normalizedCode,
        description: description.trim()
      };

      const inserted = await tx.run(
        INSERT.into('salesdb.UnitOfMeasurement').entries(newUoM)
      );

      // Fetch the created record
      const created = await tx.run(
        SELECT.from('salesdb.UnitOfMeasurement')
          .columns('code', 'description')
          .where({ code: normalizedCode })
      );

      console.log(`✅ Created UoM via action: ${created[0].code}`);
      return created[0];

    } catch (err) {
      return req.error(500, `Error creating UnitOfMeasurement: ${err.message}`);
    }
  });

  // -------------------------------- Third App - Execution order main ------------------------------ //
  //GET all
  this.on('READ', ExecutionOrderMains, async (req) => {
    if (req.data.executionOrderMainCode) {
      return SELECT.one.from(ExecutionOrderMains).where({ executionOrderMainCode: req.data.executionOrderMainCode })
    }
    return SELECT.from(ExecutionOrderMains)
  })

  //DELETE
  this.on('DELETE', ExecutionOrderMains, async (req) => {
    const { executionOrderMainCode } = req.data
    return DELETE.from(ExecutionOrderMains).where({ executionOrderMainCode })
  })

  //UPDATE
  this.on('UPDATE', ExecutionOrderMains, async (req) => {
    const { executionOrderMainCode, ...rest } = req.data
    return UPDATE(ExecutionOrderMains).set(rest).where({ executionOrderMainCode })
  })

  //Action: getExecutionOrderMainById
  this.on('getExecutionOrderMainById', async (req) => {
    const { executionOrderMainCode } = req.data
    return SELECT.one.from(ExecutionOrderMains).where({ executionOrderMainCode })
  })

  //Action: fetchExecutionOrderMainByDebitMemo
  this.on('fetchExecutionOrderMainByDebitMemo', async (req) => {
    const { debitMemoRequest, debitMemoRequestItem } = req.data;

    try {
      // Step 1: Fetch Debit Memo data from S/4
      const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest?$top=200`;
      const res = await axios.get(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' }
      });
      const results = res?.data?.d?.results || [];

      const matched = results.find(r => r.DebitMemoRequest === debitMemoRequest);
      if (!matched) return req.error(404, `DebitMemoRequest ${debitMemoRequest} not found in S/4`);

      const referenceSDDocument = matched.ReferenceSDDocument;
      if (!referenceSDDocument) return req.error(404, `No ReferenceSDDocument for ${debitMemoRequest}`);

      // Step 2: Fetch execution orders
      let executionOrders = await SELECT.from(ExecutionOrderMains)
        .where({ referenceId: referenceSDDocument });

      if (!executionOrders.length)
        return req.error(404, `No ExecutionOrders with ReferenceSDDocument ${referenceSDDocument}`);

      // Step 3: Optional filtering
      if (debitMemoRequestItem) {
        executionOrders = executionOrders.filter(o => o.salesOrderItem === debitMemoRequestItem);
        if (!executionOrders.length)
          return req.error(404, `No ExecutionOrders with ReferenceSDDocument ${referenceSDDocument} and item ${debitMemoRequestItem}`);
      }

      return executionOrders;

    } catch (err) {
      req.error(500, `Failed to fetch debit memo execution orders: ${err.message}`);
    }
  })


  //Action: saveOrUpdateExecutionOrders
  this.on('saveOrUpdateExecutionOrders', async (req) => {
    const {
      executionOrders,
      salesOrder,
      salesOrderItem,
      pricingProcedureStep,
      pricingProcedureCounter,
      customerNumber
    } = req.data;

    const tx = cds.transaction(req);
    let savedOrders = [];

    try {
      // === Step 1: Delete existing records for same SalesOrder + Item ===
      if (salesOrder && salesOrderItem) {
        await tx.run(
          DELETE.from(ExecutionOrderMains).where({ referenceId: salesOrder, salesOrderItem })
        );
      }

      // === Step 2: Fetch S/4 Sales Orders for ReferenceSDDocument enrichment ===
      let salesOrderResults = [];
      try {
        const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$top=200`;
        const res = await axios.get(url, {
          headers: { Authorization: authHeader, Accept: 'application/json' }
        });
        salesOrderResults = res?.data?.d?.results || [];
      } catch (e) {
        console.warn('⚠️ Could not load SalesOrders from S/4:', e.message);
      }

      // === Step 3: Insert each execution order ===
      for (const command of executionOrders) {
        const order = { ...command };

        // Add references
        order.referenceId = salesOrder;
        order.salesOrderItem = salesOrderItem;

        // Fetch ReferenceSDDocument
        if (salesOrder && salesOrderResults.length) {
          const match = salesOrderResults.find(o => o.SalesOrder === salesOrder);
          if (match) order.referenceSDDocument = match.ReferenceSDDocument;
        }

        // 🔹 Calculate per-record total and totalHeader
        const totalQty = Number(order.totalQuantity || 0);
        const amtPerUnit = Number(order.amountPerUnit || 0);
        order.total = totalQty * amtPerUnit;
        order.totalHeader = order.total;

        // Insert into DB
        const inserted = await tx.run(INSERT.into(ExecutionOrderMains).entries(order));
        const saved = inserted[0] ?? order;

        // Update totalHeader (ensures DB reflects correct sum)
        await tx.run(
          UPDATE(ExecutionOrderMains)
            .set({ totalHeader: order.total })
            .where({ executionOrderMainCode: saved.executionOrderMainCode })
        );

        saved.totalHeader = order.total;
        savedOrders.push(saved);
      }

      // === Step 4: Aggregate totalHeader for Pricing API ===
      const totalHeaderSum = savedOrders.reduce(
        (sum, item) => sum + (Number(item.totalHeader) || 0),
        0
      );

      // === Step 5: Update each record with the aggregated totalHeader ===
      for (const saved of savedOrders) {
        await tx.run(
          UPDATE(ExecutionOrderMains)
            .set({ totalHeader: totalHeaderSum })
            .where({ executionOrderMainCode: saved.executionOrderMainCode })
        );
        saved.totalHeader = totalHeaderSum;
      }

      // === Step 6: Call Pricing API ===
      try {
        await callSalesOrderPricingAPI(
          salesOrder,
          salesOrderItem,
          pricingProcedureStep,
          pricingProcedureCounter,
          totalHeaderSum
        );
      } catch (apiErr) {
        req.warn(`⚠️ Pricing API call failed: ${apiErr.message}`);
      }

      return savedOrders;
    } catch (err) {
      req.error(500, `Error in saveOrUpdateExecutionOrders: ${err.message}`);
    }
  })


  async function callSalesOrderPricingAPI(
    salesOrder,
    salesOrderItem,
    pricingProcedureStep,
    pricingProcedureCounter,
    totalHeader
  ) {
    // Confirmed working in Postman:
    // PATCH A_SalesOrderItemPrElement(SalesOrder='84',SalesOrderItem='10',PricingProcedureStep='20',PricingProcedureCounter='1')
    // Auth: Basic BTP_USER1 / #yiVfheJbFolFxgkEwCBFcWvYkPzrQDENEArAXn5
    // Headers: x-csrf-token (fetched), If-Match: *, Content-Type: application/json
    // Body: { "ConditionType": "PPR0", "ConditionRateValue": "<totalHeader>" }
    //
    // Step and counter are ALWAYS 20 and 1 for this sales order pricing procedure.
    // The frontend passes 10/1 but that does not exist in S4 — 20/1 is the correct PPR0 position.

    const STEP = '20';
    const COUNTER = '1';

    const requestBody = {
      ConditionType: 'PPR0',
      ConditionRateValue: (Math.round(Number(totalHeader) * 100) / 100).toFixed(2)
    };

    // Step 1: GET pricing elements to fetch CSRF token + session cookie
    // (same URL pattern confirmed working in Postman)
    const tokenURL = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${salesOrderItem}')/to_PricingElement?$top=50`;

    const tokenResp = await axios.get(tokenURL, {
      headers: {
        'x-csrf-token': 'Fetch',
        Authorization: authHeader,
        Accept: 'application/json'
      },
      validateStatus: () => true   // never throw — read CSRF even on non-200
    });

    const csrfToken = tokenResp.headers['x-csrf-token'];
    const rawCookies = tokenResp.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');

    console.log(`[pricingAPI] tokenFetch status=${tokenResp.status} csrfToken=${csrfToken ? 'OK' : 'MISSING'}`);
    if (!csrfToken) throw new Error(`Failed to fetch CSRF token (status: ${tokenResp.status})`);

    // Step 2: PATCH the confirmed-working PPR0 pricing element
    const patchURL = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItemPrElement(SalesOrder='${salesOrder}',SalesOrderItem='${salesOrderItem}',PricingProcedureStep='${STEP}',PricingProcedureCounter='${COUNTER}')`;

    console.log(`[pricingAPI] PATCH ${patchURL} body=${JSON.stringify(requestBody)}`);

    const patchResp = await axios.patch(patchURL, requestBody, {
      headers: {
        Authorization: authHeader,
        'x-csrf-token': csrfToken,
        'If-Match': '*',
        'Content-Type': 'application/json',
        Cookie: cookieStr
      },
      validateStatus: () => true
    });

    console.log(`[pricingAPI] PATCH status=${patchResp.status}`);
    if (patchResp.status < 200 || patchResp.status >= 300) {
      throw new Error(`S4 pricing PATCH failed (${patchResp.status}): ${JSON.stringify(patchResp.data)}`);
    }
  }

  //Action: findBySalesOrderAndItem
  // Mirror Spring Boot: navigate item → to_SalesOrder (header) which carries ReferenceSDDocument
  this.on('findBySalesOrderAndItem', async (req) => {
    const { salesOrder, salesOrderItem } = req.data
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${salesOrderItem}')/to_SalesOrder`
    const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    return JSON.stringify(res.data)
  })

  //Action: findItemsBySalesOrder
  this.on('findItemsBySalesOrder', async (req) => {
    const { salesOrder } = req.data
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${salesOrder}')/to_Item?$top=200`
    const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    return JSON.stringify(res.data)
  })

  //Action: getExecutionOrderMainByReferenceId
  this.on('getExecutionOrderMainByReferenceId', async (req) => {
    const { referenceId, salesOrderItem } = req.data
    let items = await SELECT.from(ExecutionOrderMains).where(
      salesOrderItem ? { referenceId, salesOrderItem } : { referenceId }
    )
    if (!items.length) return []

    try {
      const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${referenceId}')/to_Item?$top=200`
      const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
      const results = res?.data?.d?.results || []

      if (salesOrderItem) {
        const match = results.find(r => r.SalesOrderItem === salesOrderItem)
        if (match) {
          const text = match.SalesOrderItemText
          items = items.map(it => ({ ...it, salesOrderItemText: text }))
          const tx = cds.transaction(req)
          for (const it of items) {
            await tx.run(UPDATE(ExecutionOrderMains).set({ salesOrderItemText: text }).where({ executionOrderMainCode: it.executionOrderMainCode }))
          }
        }
      }
    } catch (e) {
      console.warn('Could not enrich SalesOrderItemText:', e.message)
    }

    return items
  })

  //Action: findByLineNumber
  this.on('findByLineNumber', async (req) => {
    const { lineNumber } = req.data
    return SELECT.from(ExecutionOrderMains).where({ lineNumber })
  })

  // -------------------------------- Fourth App - Service Invoice main ------------------------------ //

  // === Get all
  this.on('getAllServiceInvoices', async () => {
    return SELECT.from(ServiceInvoiceMains)
  })

  // === Get by ID
  this.on('getServiceInvoiceById', async (req) => {
    return SELECT.one.from(ServiceInvoiceMains).where({ serviceInvoiceCode: req.data.serviceInvoiceCode })
  })

  // === Find by DebitMemo + Item
  this.on('findByDebitMemoRequestAndItem', async (req) => {
    const { debitMemoRequest, debitMemoRequestItem } = req.data
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest('${debitMemoRequest}')/to_Item('${debitMemoRequestItem}')`
    const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    return JSON.stringify(res.data)
  })

  // === Find all items by DebitMemo
  this.on('findItemsByDebitMemoRequest', async (req) => {
    const { debitMemoRequest } = req.data
    const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest('${debitMemoRequest}')/to_Item?$top=200`
    const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    return JSON.stringify(res.data)
  })

  // === Get ServiceInvoice by ReferenceId
  this.on('getServiceInvoiceByReferenceId', async (req) => {
    const { referenceId, debitMemoRequestItem } = req.data
    let items = await SELECT.from(ServiceInvoiceMains).where({ referenceId, debitMemoRequestItem })
    if (!items.length) return []
    return items
  })

  // === Delete
  this.on('deleteServiceInvoice', async (req) => {
    const { serviceInvoiceCode } = req.data
    await DELETE.from(ServiceInvoiceMains).where({ serviceInvoiceCode })
    return true
  })

  // === Calculate total header
  this.on('calculateTotalHeaderServiceInvoice', async () => {
    const rows = await SELECT.from(ServiceInvoiceMains)
    return rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0)
  })

  // === Calculate total for one invoice
  this.on('calculateTotalServiceInvoice', async (req) => {
    const row = await SELECT.one.from(ServiceInvoiceMains).where({ serviceInvoiceCode: req.data.serviceInvoiceCode })
    if (!row) return 0
    return (Number(row.quantity) || 0) * (Number(row.amountPerUnit) || 0)
  })

  // === Calculate Quantities (with accumulation)
  this.on('calculateQuantities', async (req) => {
    const {
      executionOrderMainCode,
      quantity,
      totalQuantity,
      amountPerUnit,
      overFulfillmentPercentage,
      unlimitedOverFulfillment
    } = req.data;

    if (!executionOrderMainCode) return req.error(400, 'Execution Order Main Code is required');

    const tempData = tempDataService.getOrCreate(executionOrderMainCode);
    tempData.version++;

    // Read accumulated totals from ExecutionOrderMain — it is always up-to-date
    // after each saveOrUpdateServiceInvoices call (Step 4 keeps it in sync).
    const execOrder = await SELECT.one.from(ExecutionOrderMains).where({ executionOrderMainCode });
    const postedAQ    = Number(execOrder?.actualQuantity) || 0;
    const postedTotal = Number(execOrder?.totalHeader)    || 0;

    let allowedQuantity = totalQuantity || 0;
    if (overFulfillmentPercentage) allowedQuantity += (totalQuantity * overFulfillmentPercentage / 100);
    if (unlimitedOverFulfillment) allowedQuantity = Number.MAX_VALUE;

    const currentQuantity = quantity ?? tempData.quantities[tempData.currentQuantityIndex] ?? 0;
    const totalRequested = postedAQ + currentQuantity;

    if (totalRequested > allowedQuantity) return req.error(400, 'Quantity exceeds allowed limit');

    // Update temp data
    tempData.quantities.push(currentQuantity);
    tempData.currentQuantityIndex = tempData.quantities.length - 1;
    tempData.amountPerUnit = amountPerUnit || tempData.amountPerUnit || 0;
    tempData.actualQuantity = postedAQ + currentQuantity;
    // total  = this invoice only (what calculateQuantitiesWithoutAccumulation also returns)
    // totalHeader = cumulative across all invoices
    tempData.total = currentQuantity * tempData.amountPerUnit;
    tempData.totalHeader = postedTotal + (currentQuantity * tempData.amountPerUnit);
    tempData.remainingQuantity = Math.max((totalQuantity || 0) - tempData.actualQuantity, 0);
    tempData.actualPercentage = totalQuantity ? Math.min((tempData.actualQuantity / totalQuantity) * 100, 100) : 0;

    tempDataService.update(executionOrderMainCode, tempData);
    return tempData;
  })


  // === Calculate Quantities Without Accumulation ===
  this.on('calculateQuantitiesWithoutAccumulation', async (req) => {
    try {
      const { executionOrderMainCode, quantity, totalQuantity, amountPerUnit } = req.data

      if (!executionOrderMainCode) return req.error(400, "Execution Order Main Code is required")

      // Ensure we can handle UUID keys
      const code = typeof executionOrderMainCode === 'string'
        ? executionOrderMainCode
        : String(executionOrderMainCode)

      const tempData = tempDataService.getOrCreate(code)
      tempData.version = (tempData.version || 0) + 1

      // --- Core logic ---
      const q = Number(quantity) || 0
      const aq = Number(amountPerUnit) || tempData.amountPerUnit || 0
      const tq = Number(totalQuantity) || 0

      tempData.quantities.push(q)
      tempData.currentQuantityIndex = tempData.quantities.length - 1
      tempData.amountPerUnit = aq
      tempData.remainingQuantity = Math.max(tq - q, 0)
      tempData.actualQuantity = q
      tempData.actualPercentage = tq ? (q / tq) * 100 : 0
      tempData.total = q * aq
      tempData.totalHeader = tempData.total

      // --- Save updated temp data ---
      tempDataService.update(code, tempData)

      // Return response consistent with Java logic
      return {
        quantities: tempData.quantities,
        currentQuantityIndex: tempData.currentQuantityIndex,
        amountPerUnit: tempData.amountPerUnit,
        remainingQuantity: tempData.remainingQuantity,
        actualQuantity: tempData.actualQuantity,
        actualPercentage: tempData.actualPercentage,
        total: tempData.total,
        totalHeader: tempData.totalHeader,
        version: tempData.version
      }

    } catch (err) {
      console.error('❌ Error in calculateQuantitiesWithoutAccumulation:', err.message)
      req.error(500, `Error in calculateQuantitiesWithoutAccumulation: ${err.message}`)
    }
  })


  // === SAVE OR UPDATE SERVICE INVOICES ===
  this.on('saveOrUpdateServiceInvoices', async (req) => {
    const {
      serviceInvoiceCommands,
      debitMemoRequest,
      debitMemoRequestItem,
      pricingProcedureStep,
      pricingProcedureCounter,
      customerNumber
    } = req.data;

    const tx = cds.transaction(req);
    let savedInvoices = [];

    try {
      if (!serviceInvoiceCommands || serviceInvoiceCommands.length === 0) {
        req.error(400, 'No service invoice data provided');
      }

      // Step 1: Delete existing entries for same debitMemoRequest + item
      if (debitMemoRequest && debitMemoRequestItem) {
        await tx.run(
          DELETE.from(ServiceInvoiceMains).where({ referenceId: debitMemoRequest, debitMemoRequestItem })
        );
      }

      // Step 2: Fetch ReferenceSDDocument from S/4
      let referenceSDDocument = null;
      if (debitMemoRequest) {
        try {
          const url = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoRequest?$top=100`;
          const res = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
          const results = res?.data?.d?.results || [];

          const match = results.find(r => r.DebitMemoRequest === debitMemoRequest);
          if (match) referenceSDDocument = match.ReferenceSDDocument;
        } catch (e) {
          console.warn('⚠️ Could not fetch ReferenceSDDocument:', e.message);
        }
      }

      // Step 3: Process each service invoice command
      for (const cmd of serviceInvoiceCommands) {
        const code = cmd.executionOrderMainCode;

        // Use cmd.quantity directly — this is the per-invoice billed quantity sent
        // by the frontend (item.quantity, set in onSaveEdit before onSaveDocument).
        // We do NOT use tempData for quantity resolution because tempData is keyed
        // by executionOrderMainCode and shared across all rows for the same order:
        // if a document has two rows for the same order, tempData would return the
        // LAST calculateQuantities result (e.g. 10) for BOTH rows, overwriting the
        // first row's correct quantity (e.g. 20).
        const quantity = Number(cmd.quantity);
        if (!quantity && quantity !== 0) throw new Error(`Quantity missing for execution order ${code}`);

        // --- Amount per unit ---
        const amountPerUnit = Number(cmd.amountPerUnit);
        if (!amountPerUnit) throw new Error(`Amount per unit missing for execution order ${code}`);

        const total = quantity * amountPerUnit;
        const totalQuantity = Number(cmd.totalQuantity) || 0;

        // Mirror Java: invoice.calculateCurrentPercentage() = (quantity / totalQuantity) * 100
        const currentPercentage = totalQuantity > 0 ? Math.round((quantity / totalQuantity) * 100 * 1000) / 1000 : 0;

        // --- Compose entry ---
        // remainingQuantity, actualQuantity, actualPercentage, totalHeader are
        // per-invoice snapshots at save time. Step 4 will recompute ExecutionOrderMain
        // with the true cumulative values after all inserts are done.
        // We use cmd.remainingQuantity / actualQuantity / actualPercentage / totalHeader
        // which were set by calculateQuantities on the frontend before onSaveDocument ran.
        const entry = {
          ...cmd,
          referenceId: debitMemoRequest,
          debitMemoRequestItem,
          referenceSDDocument,
          quantity,
          amountPerUnit,
          total,
          totalQuantity,
          currentPercentage,
          // Use values from cmd (set by calculateQuantities response in onSaveEdit)
          actualQuantity:    Number(cmd.actualQuantity)    || quantity,
          remainingQuantity: Number(cmd.remainingQuantity) ?? 0,
          actualPercentage:  Number(cmd.actualPercentage)  ?? 0,
          totalHeader:       Number(cmd.totalHeader)       || total
        };

        // --- Save invoice ---
        const inserted = await tx.run(INSERT.into(ServiceInvoiceMains).entries(entry));
        savedInvoices.push(inserted[0] ?? entry)
      }

      // Step 4: Update ExecutionOrderMain with fresh cumulative totals.
      // IMPORTANT: Step 1 already deleted old invoices for this document, and Step 3
      // just inserted new ones. ExecutionOrderMain.actualQuantity is stale (still
      // includes deleted rows). We must query ALL current ServiceInvoiceMains rows
      // for each execution order to get the true cumulative state.
      // Process each distinct executionOrderMainCode once.
      const processedCodes = new Set();
      for (const cmd of serviceInvoiceCommands) {
        const code = cmd.executionOrderMainCode;
        if (!code || processedCodes.has(code)) continue;
        processedCodes.add(code);

        // Query all invoices for this execution order that exist in the DB now
        // (i.e. old invoices from this document are gone, new ones just inserted).
        const allInvoices = await SELECT.from(ServiceInvoiceMains).where({ executionOrderMainCode: code });

        const totalActualQty  = allInvoices.reduce((s, inv) => s + (Number(inv.quantity) || 0), 0);
        const totalHeaderSum  = allInvoices.reduce((s, inv) => s + (Number(inv.total)    || 0), 0);
        const totalQty        = Number(cmd.totalQuantity) || 0;
        const remainingQty    = totalQty > 0 ? Math.max(totalQty - totalActualQty, 0) : 0;
        const cumulativePct   = totalQty > 0 ? Math.min((totalActualQty / totalQty) * 100, 100) : 0;

        await tx.run(
          UPDATE(ExecutionOrderMains)
            .set({
              actualQuantity:    totalActualQty,
              remainingQuantity: remainingQty,
              actualPercentage:  cumulativePct,
              totalHeader:       totalHeaderSum
            })
            .where({ executionOrderMainCode: code })
        );
      }

      // Step 5: Call Debit Memo Pricing API
      const totalHeaderSum = savedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
      try {
        await callDebitMemoPricingAPI(
          debitMemoRequest,
          debitMemoRequestItem,
          pricingProcedureStep,
          pricingProcedureCounter,
          totalHeaderSum
        );
      } catch (apiErr) {
        req.warn(`Failed to update debit memo pricing: ${apiErr.message}`);
      }

      return savedInvoices;
    } catch (err) {
      req.error(500, `Error in saveOrUpdateServiceInvoices: ${err.message}`);
    }
  })

  // === Find by LineNumber
  this.on('findByLineNumberServiceInvoice', async (req) => {
    return SELECT.from(ServiceInvoiceMains).where({ lineNumber: req.data.lineNumber })
  })

  // === Debit Memo Pricing API (must be INSIDE module scope to access authHeader) ===
  async function callDebitMemoPricingAPI(
    debitMemoRequest,
    debitMemoRequestItem,
    pricingProcedureStep,
    pricingProcedureCounter,
    totalHeader
  ) {
    // Confirmed working in Postman:
    // PATCH A_DebitMemoReqItemPrcgElmnt(DebitMemoRequest='70000106',DebitMemoRequestItem='10',PricingProcedureStep='20',PricingProcedureCounter='1')
    // Auth: Basic BTP_USER1 / #yiVfheJbFolFxgkEwCBFcWvYkPzrQDENEArAXn5
    // Headers: x-csrf-token (fetched), If-Match: *, Content-Type: application/json
    //
    // KEY: Use the exact PATCH URL itself for the token GET — S4 returns x-csrf-token
    // in response headers regardless of the HTTP status (even 405 Method Not Allowed).
    // validateStatus: () => true ensures axios never throws so we always read the token.

    const STEP = '20';
    const COUNTER = '1';

    const body = {
      ConditionType: 'PPR0',
      ConditionRateValue: (Math.round(Number(totalHeader) * 100) / 100).toFixed(2)
    };

    // Step 1: GET the exact PATCH URL to fetch CSRF token + session cookie
    const resourceURL = `https://my418629.s4hana.cloud.sap/sap/opu/odata/sap/API_DEBIT_MEMO_REQUEST_SRV/A_DebitMemoReqItemPrcgElmnt(DebitMemoRequest='${debitMemoRequest}',DebitMemoRequestItem='${debitMemoRequestItem}',PricingProcedureStep='${STEP}',PricingProcedureCounter='${COUNTER}')`;

    const tokenResp = await axios.get(resourceURL, {
      headers: {
        'x-csrf-token': 'Fetch',
        Authorization: authHeader,
        Accept: 'application/json',
      },
      validateStatus: () => true   // never throw — read CSRF token even from non-200
    });

    const csrfToken = tokenResp.headers['x-csrf-token'];
    const rawCookies = tokenResp.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');

    console.log(`[debitMemoPricingAPI] tokenFetch status=${tokenResp.status} csrfToken=${csrfToken ? 'OK' : 'MISSING'}`);
    if (!csrfToken) throw new Error(`Failed to fetch CSRF token for debit memo (status: ${tokenResp.status})`);

    // Step 2: PATCH — same URL, confirmed working in Postman
    console.log(`[debitMemoPricingAPI] PATCH ${resourceURL} body=${JSON.stringify(body)}`);

    const patchResp = await axios.patch(resourceURL, body, {
      headers: {
        Authorization: authHeader,
        'x-csrf-token': csrfToken,
        'If-Match': '*',
        'Content-Type': 'application/json',
        Cookie: cookieStr,
      },
      validateStatus: () => true
    });

    console.log(`[debitMemoPricingAPI] PATCH status=${patchResp.status}`);
    if (patchResp.status < 200 || patchResp.status >= 300) {
      throw new Error(`Debit memo pricing PATCH failed (${patchResp.status}): ${JSON.stringify(patchResp.data)}`);
    }
  }
})