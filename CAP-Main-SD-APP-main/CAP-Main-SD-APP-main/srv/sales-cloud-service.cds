using {salesdb} from '../db/schema';

@title               : 'Sales Cloud Service'
@Core.LongDescription: 'This service exposes APIs for managing Sales Cloud objects such as Line Types, Formulas, Materials, and Currencies.'

service SalesCloudService {
  entity Currencies                 as projection on salesdb.Currency;
  entity LineTypes                  as projection on salesdb.LineType;
  entity MaterialGroups             as projection on salesdb.MaterialGroup;
  entity PersonnelNumbers           as projection on salesdb.PersonnelNumber;
  entity ServiceTypes               as projection on salesdb.ServiceType;
  entity Formulas                   as projection on salesdb.Formula;
  entity ModelSpecifications        as projection on salesdb.ModelSpecifications;
  entity ExecutionOrderMains        as projection on salesdb.ExecutionOrderMain;
  entity InvoiceMainItems           as projection on salesdb.InvoiceMainItem;
  entity ModelSpecificationsDetails as projection on salesdb.ModelSpecificationsDetails;
  entity ServiceNumbers             as projection on salesdb.ServiceNumber;
  entity ServiceInvoiceMains        as projection on salesdb.ServiceInvoiceMain;
  entity InvoiceSubItems            as projection on salesdb.InvoiceSubItem;

  entity UnitOfMeasurements         as
    projection on salesdb.UnitOfMeasurement {
      key code,
          description
    }

  /**
       * External projection of Sales Quotation Header
            */
  entity SalesQuotation {
    key SalesQuotation      : String(20);
        SalesOrganization   : String(10);
        DistributionChannel : String(10);
        Division            : String(10);
        SalesQuotationType  : String(4);
        SalesQuotationDate  : Date;
        SoldToParty         : String(20);
        TransactionCurrency : String(5);
        TotalNetAmount      : Decimal(15, 2);

        items               : Association to many SalesQuotationItem
                                on items.SalesQuotation = $self.SalesQuotation;
  }

  /**
     * External projection of Sales Quotation Item
        */
  entity SalesQuotationItem {
    key SalesQuotation        : String(20);
    key SalesQuotationItem    : String(6);

        Material              : String(40);
        RequestedQuantity     : Decimal(15, 3);
        RequestedQuantityUnit : String(3);
        NetAmount             : Decimal(15, 2);

        header                : Association to SalesQuotation
                                  on header.SalesQuotation = $self.SalesQuotation;
  }

  // New action to fetch SalesQuotation by Quotation + Item
  // action getRelatedSalesQuotation(
  //   SalesQuotation    : String(20),
  //   SalesQuotationItem: String(10)
  // ) returns SalesQuotation;


  // === Entities exposed via READ handlers ===
  entity SalesOrders @readonly @(path: '/salesordercloud') {
    key SalesOrder       : String;
        SalesOrderType   : String;
        SalesOrg         : String;
        DistributionChnl : String;
        Division         : String;
        CreatedByUser    : String;
        CreatedAt        : DateTime;
  }

  entity SalesOrderItems @readonly {
    key SalesOrder        : String;
    key SalesOrderItem    : String;
        Material          : String;
        RequestedQuantity : Decimal(13, 3);
  }

  entity SalesOrderItemsById @readonly {
    key SalesOrderID : String;
  }

  entity SalesOrderPricingElement @readonly {
    key SalesOrder         : String;
    key SalesOrderItem     : String;
    key ConditionType      : String;
        ConditionRateValue : Decimal(13, 3);
        Currency           : String;
  }

  entity SalesOrderByItem @readonly {
    key SalesOrder     : String;
    key SalesOrderItem : String;
  }

  entity SalesOrderPricing @readonly {
    key SalesOrder     : String;
    key SalesOrderItem : String;
    key ConditionType  : String;
  }


  entity SalesQuotationPricing @readonly {
    key SalesQuotation     : String;
    key SalesQuotationItem : String;
    key ConditionType      : String;
  }

  entity DebitMemo @readonly {
    key DebitMemoRequest : String;
        CompanyCode      : String;
        CreatedByUser    : String;
  }

  entity DebitMemoPricing @readonly {
    key DebitMemoRequest     : String;
    key DebitMemoRequestItem : String;
    key ConditionType        : String;
  }

  entity DebitMemoRequestItems @readonly {
    key DebitMemoRequest     : String;
    key DebitMemoRequestItem : String;
  }

  entity DebitMemoRequestByItem @readonly {
    key DebitMemoRequest     : String;
    key DebitMemoRequestItem : String;
  }

  // === Actions (POST operations) ===
  action   postSalesOrder(body: LargeString)                                               returns String;
  action   postSalesQuotation(body: LargeString)                                           returns String;

  @(Capabilities.SearchRestrictions.Searchable: true)
  action   postUnitOfMeasurement(code: String(8),
                                 description: String(60))                                  returns UnitOfMeasurements;

  action   postSalesOrderItemPricing(SalesOrder: String,
                                     SalesOrderItem: String,
                                     body: LargeString)                                    returns String;

  action   patchSalesQuotationItemPricing(SalesQuotation: String,
                                          SalesQuotationItem: String,
                                          PricingProcedureStep: String,
                                          PricingProcedureCounter: String,
                                          body: LargeString)                               returns String;

  action   patchSalesOrderItemPricing(SalesOrder: String,
                                      SalesOrderItem: String,
                                      PricingProcedureStep: String,
                                      PricingProcedureCounter: String,
                                      body: LargeString)                                   returns String;

  action   patchDebitMemoItemPricing(DebitMemoRequest: String,
                                     DebitMemoRequestItem: String,
                                     PricingProcedureStep: String,
                                     PricingProcedureCounter: String,
                                     body: LargeString)                                    returns String;

  action   searchFormulas(keyword: String)                                                 returns many Formulas;
  action   searchModelSpecifications(keyword: String)                                      returns many ModelSpecifications;
  // action getExecutionOrderMainById(executionOrderMainCode: Integer)             returns ExecutionOrderMains;

  // action saveOrUpdateExecutionOrders(executionOrders: array of ExecutionOrderMains,
  //                                    salesOrder: String,
  //                                    salesOrderItem: String,
  //                                    customerNumber: String)                    returns array of ExecutionOrderMains;

  // action findBySalesOrderAndItem(salesOrder: String, salesOrderItem: String)    returns String;
  // action getInvoiceMainItemsByReferenceId(referenceId: String)                  returns array of ExecutionOrderMains;
  // action findByLineNumber(lineNumber: String)                                   returns array of ExecutionOrderMains;

  @readonly
  action   calculateTotal(invoiceMainItemCode: Integer)                                    returns Decimal(15, 2);

  @readonly
  action   calculateTotalHeader()                                                          returns Decimal(15, 2);

  @readonly
  action   fetchByReferenceId(referenceId: String)                                         returns many InvoiceMainItems;

  @readonly
  action   search(keyword: String)                                                         returns many InvoiceMainItems;

  action   searchServiceNumber(keyword: String)                                            returns many ServiceNumbers;

  // action   calculateTotalHeaderServiceInvoice()                                            returns Decimal(15, 2);
  // action   calculateTotalServiceInvoice(serviceInvoiceCode: Integer)                       returns Decimal(15, 2);
  // action   calculateQuantities(data: ServiceInvoiceMains)                                  returns ServiceInvoiceMains;

  // action   findByReferenceIdServiceInvoice(referenceId: String)                            returns many ServiceInvoiceMains;
  // action   findByLineNumberServiceInvoice(lineNumber: String)                              returns many ServiceInvoiceMains;


  action   findBySubItemCode(subItemCode: Integer)                                         returns InvoiceSubItems;
  action   searchSubItem(keyword: String)                                                  returns many InvoiceSubItems;


  // action updateMainItemCommand(
  //   salesQuotation        : String,
  //   salesQuotationItem    : String,
  //   pricingProcedureStep  : Integer,
  //   pricingProcedureCounter : Integer,
  //   customerNumber        : String,
  //   invoiceMainItemCommand : InvoiceMainItemCommand
  // ) returns InvoiceMainItems;

  action   saveOrUpdateMainItems(salesQuotation: String,
                                 salesQuotationItem: String,
                                 pricingProcedureStep: String,
                                 pricingProcedureCounter: String,
                                 customerNumber: String,
                                 invoiceMainItemCommands: array of InvoiceMainItemCommand) returns array of InvoiceMainItemCommand;


  @Core.LongDescription: 'Fetches InvoiceMainItems by referenceId and salesQuotationItem'
  action   getInvoiceMainItemByReferenceIdAndItemNumber(referenceId: String  @mandatory  @title: 'Reference ID',
                                                        salesQuotationItem: String  @mandatory  @title: 'Sales Quotation Item'
  )                                                                                        returns array of InvoiceMainItems;

  // @Core.LongDescription: 'This service exposes APIs for managing Sales Cloud objects such as Line Types, Formulas, Materials, and Currencies.'
  //   action saveOrUpdateMainItems (
  //     @Core.Description: 'Sales Quotation number'
  //     @Common.FieldControl #Mandatory
  //     salesQuotation       : String,

  //     @Core.Description: 'Sales Quotation Item'
  //     @Common.FieldControl #Mandatory
  //     salesQuotationItem   : String,

  //     @Core.Description: 'Pricing Procedure Step'
  //     @Common.FieldControl #Mandatory
  //     pricingProcedureStep : String,

  //     @Core.Description: 'Pricing Procedure Counter'
  //     @Common.FieldControl #Mandatory
  //     pricingProcedureCounter : String,

  //     @Core.Description: 'Customer Number'
  //     @Common.FieldControl #Mandatory
  //     customerNumber       : String,

  //     @Core.Description: 'Payload with main item and subitems'
  //     invoiceMainItemCommands : InvoiceMainItemCommand
  //   ) returns array of InvoiceMainItemCommand;

  type InvoiceSubItemCommand {
    // invoiceSubItemCode    : UUID;
    invoiceMainItemCode   : UUID;
    serviceNumberCode     : UUID;
    unitOfMeasurementCode : String;
    currencyCode          : String;
    formulaCode           : String;
    description           : String;
    quantity              : Decimal(15, 3);
    amountPerUnit         : Decimal(15, 3);
    total                 : Decimal(15, 3);
  }

  type InvoiceMainItemCommand {
    // invoiceMainItemCode     : UUID;
    uniqueId                : String;
    salesQuotationItem      : String;
    salesOrderItem          : String;
    salesQuotationItemText  : String;
    referenceSDDocument     : String;
    referenceId             : String;
    serviceNumberCode       : UUID;
    unitOfMeasurementCode   : String;
    currencyCode            : String;
    formulaCode             : String;
    description             : String;
    quantity                : Decimal(15, 3);
    amountPerUnit           : Decimal(15, 3);
    total                   : Decimal(15, 3);
    totalHeader             : Decimal(15, 3);
    profitMargin            : Decimal(15, 3);
    totalWithProfit         : Decimal(15, 3);
    doNotPrint              : Boolean;
    amountPerUnitWithProfit : Decimal(15, 3);
    lineNumber              : String;
    subItemList             : array of InvoiceSubItemCommand;
  }

  // -------------------------------- Third App - Execution order main ------------------------------ //

  action   getExecutionOrderMainById(executionOrderMainCode: Integer)                      returns ExecutionOrderMains;

  function fetchExecutionOrderMainByDebitMemo(debitMemoRequest: String,
                                              debitMemoRequestItem: String)                returns array of ExecutionOrderMains;


  function getExecutionOrderMainByReferenceId(referenceId: String,
                                              salesOrderItem: String)                      returns array of ExecutionOrderMains;

  function findBySalesOrderAndItem(salesOrder: String, salesOrderItem: String)             returns String;

  function findItemsBySalesOrder(salesOrder: String)                                       returns String;

  function findByLineNumber(lineNumber: String)                                            returns array of ExecutionOrderMains;


  action   saveOrUpdateExecutionOrders(executionOrders: array of ExecutionOrderMainCommand,
                                       salesOrder: String,
                                       salesOrderItem: String,
                                       pricingProcedureStep: Integer,
                                       pricingProcedureCounter: Integer,
                                       customerNumber: String)                             returns array of ExecutionOrderMainCommand;

  type ExecutionOrderMainCommand {
    referenceSDDocument      : String;
    salesOrderItem           : String;
    debitMemoRequestItem     : String;
    salesOrderItemText       : String;
    referenceId              : String;
    serviceNumberCode        : Integer;
    description              : String;
    unitOfMeasurementCode    : String;
    currencyCode             : String;
    materialGroupCode        : String;
    personnelNumberCode      : String;
    lineTypeCode             : String;
    serviceTypeCode          : String;
    totalQuantity            : Decimal(15, 3);
    remainingQuantity        : Decimal(15, 3);
    amountPerUnit            : Decimal(15, 3);
    total                    : Decimal(15, 3);
    totalHeader              : Decimal(15, 3);
    actualQuantity           : Decimal(15, 3);
    previousQuantity         : Decimal(15, 3);
    actualPercentage         : Decimal(15, 3);
    overFulfillmentPercent   : Decimal(15, 3);
    unlimitedOverFulfillment : Boolean;
    manualPriceEntryAllowed  : Boolean;
    externalServiceNumber    : String;
    serviceText              : String;
    lineText                 : String;
    lineNumber               : String(225);
    biddersLine              : Boolean;
    supplementaryLine        : Boolean;
    lotCostOne               : Boolean;
    doNotPrint               : Boolean;
    deletionIndicator        : Boolean;
  }

  // -------------------------------- Fourth App - Service Invoice main ------------------------------ //

  action   getAllServiceInvoices()                                                         returns array of ServiceInvoiceMains;

  action   getServiceInvoiceById(serviceInvoiceCode: UUID)                                 returns ServiceInvoiceMains;

  function findByDebitMemoRequestAndItem(debitMemoRequest: String,
                                         debitMemoRequestItem: String)                     returns String;

  function findItemsByDebitMemoRequest(debitMemoRequest: String)                           returns String;

  action   getServiceInvoiceByReferenceId(referenceId: String,
                                          debitMemoRequestItem: String)                    returns array of ServiceInvoiceMains;

  action   deleteServiceInvoice(serviceInvoiceCode: UUID)                                  returns Boolean;

  @readonly
  action   calculateTotalHeaderServiceInvoice()                                            returns Decimal(15, 3);

  @readonly
  action   calculateTotalServiceInvoice(serviceInvoiceCode: UUID)                          returns Decimal(15, 3);

  type CalculatedQuantitiesResponse : {
    actualQuantity    : Decimal;
    remainingQuantity : Decimal;
    total             : Decimal;
    actualPercentage  : Decimal;
    totalHeader       : Decimal;
  }

  action   calculateQuantities(executionOrderMainCode: UUID,
                               quantity: Decimal(15, 3),
                               totalQuantity: Decimal(15, 3),
                               amountPerUnit: Decimal(15, 3),
                               overFulfillmentPercentage: Decimal(15, 3),
                               unlimitedOverFulfillment: Boolean)                          returns CalculatedQuantitiesResponse;


  action   calculateQuantitiesWithoutAccumulation(executionOrderMainCode: UUID,
                                                  quantity: Decimal,
                                                  totalQuantity: Decimal,
                                                  amountPerUnit: Decimal)                  returns CalculatedQuantitiesResponse;

  action   saveOrUpdateServiceInvoices(serviceInvoiceCommands: array of ServiceInvoiceMainCommand,
                                       debitMemoRequest: String,
                                       debitMemoRequestItem: String,
                                       pricingProcedureStep: Integer,
                                       pricingProcedureCounter: Integer,
                                       customerNumber: String)                             returns array of ServiceInvoiceMainCommand;

  function findByLineNumberServiceInvoice(lineNumber: String)                              returns array of ServiceInvoiceMains;

  type ServiceInvoiceMainCommand {
    executionOrderMainCode   : UUID;
    referenceSDDocument      : String;
    debitMemoRequestItem     : String;
    debitMemoRequestItemText : String;
    referenceId              : String;
    serviceNumberCode        : Integer;
    description              : String;
    unitOfMeasurementCode    : String;
    currencyCode             : String;
    materialGroupCode        : String;
    personnelNumberCode      : String;
    lineTypeCode             : String;
    serviceTypeCode          : String;
    remainingQuantity        : Decimal(15, 3);
    quantity                 : Decimal(15, 3);
    currentPercentage        : Decimal(15, 3);
    totalQuantity            : Decimal(15, 3);
    amountPerUnit            : Decimal(15, 3);
    total                    : Decimal(15, 3);
    actualQuantity           : Decimal(15, 3);
    actualPercentage         : Decimal(15, 3);
    overFulfillmentPercent   : Decimal(15, 3);
    unlimitedOverFulfillment : Boolean;
    externalServiceNumber    : String;
    serviceText              : String;
    lineText                 : String;
    lineNumber               : String(225);
    biddersLine              : Boolean;
    supplementaryLine        : Boolean;
    lotCostOne               : Boolean;
    doNotPrint               : Boolean;
    alternatives             : String;
    totalHeader              : Decimal(15, 3);
    temporaryDeletion        : String(9);
  }

// action saveOrUpdateModelSpecificationsDetails(
//   modelSpecificationsDetailsCommands: array of ModelSpecificationsDetailsCommand
// ) returns array of ModelSpecificationsDetails;
// type ModelSpecificationsCommand {
//   modelSpecCode        : UUID;
//   modelSpecDetailsCode : UUID;
//   currencyCode         : String;
//   modelServSpec        : String(225);
//   blockingIndicator    : Boolean;
//   serviceSelection     : Boolean;
//   description          : String;
//   searchTerm           : String;
//   lastChangeDate       : Date;
// }

// type ModelSpecificationsDetailsCommand {
//   modelSpecDetailsCode      : UUID;
//   serviceNumberCode         : Integer;
//   noServiceNumber           : Integer;
//   serviceTypeCode           : String;
//   materialGroupCode         : String;
//   personnelNumberCode       : String;
//   unitOfMeasurementCode     : String;
//   currencyCode              : String;
//   formulaCode               : String;
//   lineTypeCode              : String;
//   selectionCheckBox         : Boolean;
//   lineIndex                 : String(225);
//   shortText                 : String;
//   quantity                  : Integer;
//   grossPrice                : Integer;
//   overFulfilmentPercentage  : Integer;
//   priceChangedAllowed       : Boolean;
//   unlimitedOverFulfillment  : Boolean;
//   pricePerUnitOfMeasurement : Integer;
//   externalServiceNumber     : String(225);
//   netValue                  : Integer;
//   serviceText               : String;
//   lineText                  : String;
//   lineNumber                : String(225);
//   alternatives              : String;
//   biddersLine               : Boolean;
//   supplementaryLine         : Boolean;
//   lotSizeForCostingIsOne    : Boolean;
//   lastChangeDate            : Date;
//   deletionIndicator         : Boolean;

//   modelSpecifications       : array of ModelSpecificationsCommand;
// }


// action getModelSpecificationsDetailsByModelSpecCode(modelSpecCode: UUID)
//   returns array of ModelSpecificationsDetails;

}
