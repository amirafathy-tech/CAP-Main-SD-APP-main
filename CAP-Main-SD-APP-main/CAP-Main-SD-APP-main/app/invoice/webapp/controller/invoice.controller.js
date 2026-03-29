sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog",
  "sap/m/HBox",
  "sap/m/VBox",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/CheckBox",
  "sap/m/Text",
  "sap/m/Button",
  "sap/ui/export/Spreadsheet",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/unified/FileUploader",
  "sap/ui/layout/form/SimpleForm",
  "sap/ui/layout/form/ResponsiveGridLayout"
], (Controller, MessageToast, SimpleForm, ResponsiveGridLayout) => {
  "use strict";

  return Controller.extend("invoice.controller.invoice", {
    onInit() {

      var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
      oRouter.getRoute("invoice").attachPatternMatched(this._onRouteMatched, this);

      //Set Dummy Data
      var oModel = new sap.ui.model.json.JSONModel({
        totalValue: 0,
        docNumber: "",
        TotalQuantity: 0,
        itemNumber: "",
        MainItems: [],

      });
      this.getView().setModel(oModel);

    },

    _onRouteMatched: function (oEvent) {
      var oView = this.getView();
      var oModel = oView.getModel();

      var args = oEvent.getParameter("arguments");
      var docNumber = args.docNumber;
      var itemNumber = args.itemNumber;

      console.log("Params:", docNumber, itemNumber);
      oModel.setProperty("/docNumber", docNumber);
      oModel.setProperty("/itemNumber", itemNumber);
      var oBody = {
        referenceId: docNumber,
        debitMemoRequestItem: itemNumber
      }
      // OData request URL
      // var sUrl = `/odata/v4/sales-cloud/findByDebitMemoRequestAndItem?debitMemoRequest='${docNumber}'&debitMemoRequestItem='${itemNumber}'`;
      var sUrl = "./odata/v4/sales-cloud/getServiceInvoiceByReferenceId"
      // Fetch the data
      fetch(sUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(oBody)
      })
        .then(response => response.json())
        .then(data => {
          console.log(data.value);
          const mainItems = Array.isArray(data.value) ? data.value : [];
          // Calculate the total sum
          const totalValue = mainItems.reduce(
            (sum, record) => sum + Number(record.total || 0),
            0
          );
          //totalWithProfit

          console.log("Total Value:", totalValue);
          oModel.setProperty("/MainItems", data.value);
          oModel.setProperty("/totalValue", totalValue);

          oView.byId("debitmemoTable").setModel(oModel);
        })
        .catch(err => {
          console.error("Error fetching MainItems", err);
        });

    },

    onExport: function () {

      var oModel = this.getView().getModel();
      // build column config (headers + property bindings)
      var aCols = [
        { label: "serviceInvoiceCode.", property: "serviceInvoiceCode" },
        { label: "executionOrderMainCode.", property: "executionOrderMainCode" },
        { label: "lineNumber", property: "lineNumber" },
        { label: "serviceNumberCode", property: "serviceNumberCode" },
        { label: "description", property: "description" },
        { label: "actualQuantity", property: "actualQuantity" },
        { label: "unitOfMeasurementCode", property: "unitOfMeasurementCode" },
        { label: "amountPerUnit", property: "amountPerUnit" },
        { label: "currencyCode", property: "currencyCode" },
        { label: "total", property: "total" },
        { label: "actualQuantity", property: "actualQuantity" },
        { label: "actualPercentage", property: "actualPercentage" },
        { label: "overFulfillmentPercent", property: "overFulfillmentPercent" },
        { label: "unlimitedOverFulfillment", property: "unlimitedOverFulfillment" },
        { label: "manualPriceEntryAllowed", property: "manualPriceEntryAllowed" },
        { label: "materialGroupCode", property: "materialGroupCode" },
        { label: "serviceTypeCode", property: "serviceTypeCode" },
        { label: "externalServiceNumber", property: "externalServiceNumber" },
        { label: "serviceText", property: "serviceText" },
        { label: "lineText", property: "lineText" },
        { label: "personnelNumberCode", property: "personnelNumberCode" },
        { label: "lineTypeCode", property: "lineTypeCode" },
        { label: "biddersLine", property: "biddersLine" },
        { label: "supplementaryLine", property: "supplementaryLine" },
        { label: "lotCostOne", property: "lotCostOne" }
      ];
      var oSettings = {
        workbook: { columns: aCols },
        dataSource: oModel.getProperty("/MainItems"),
        fileName: "Debit Memo Items.xlsx"
      };

      var oSpreadsheet = new sap.ui.export.Spreadsheet(oSettings);
      oSpreadsheet.build().finally(function () {
        oSpreadsheet.destroy();
      });
    },

    openOrdersDialog: function () {
      var that = this;
      var oView = this.getView();
      var oModel = oView.getModel();
      var docNumber = oModel.getProperty("/docNumber");
      var itemNumber = oModel.getProperty("/itemNumber");

      var oDialog = new sap.m.Dialog({
        title: "Select Rows to Copy",
        contentWidth: "90%",
        contentHeight: "70%",
        resizable: true,
        draggable: true,
        buttons: [
          new sap.m.Button({
            text: "Copy Selected",
            type: "Emphasized",
            press: function () {
              var aSelectedItems = oTable.getSelectedItems();
              if (aSelectedItems.length === 0) {
                sap.m.MessageToast.show("Please select at least one row.");
                return;
              }

              var oView = that.getView();
              var oMainModel = oView.getModel();

              var aMainItems = oMainModel.getProperty("/MainItems") || [];

              aSelectedItems.forEach(function (oItem) {
                var oData = oItem.getBindingContext().getObject();

                // Map fields properly to match your table’s bindings
                aMainItems.push({
                  executionOrderMainCode: oData.executionOrderMainCode,
                  lineNumber:             "",
                  serviceNumberCode:      oData.serviceNumberCode,
                  description:            oData.description,
                  unitOfMeasurementCode:  oData.unitOfMeasurementCode,
                  amountPerUnit:          oData.amountPerUnit,
                  currencyCode:           oData.currencyCode,
                  total:                  0,
                  totalQuantity:          oData.totalQuantity,
                  currentQuantity:        0,
                  // Use ExecutionOrderMain's live cumulative fields so the row
                  // already reflects all previously saved invoices for this order.
                  quantity:               0,
                  actualQuantity:          oData.actualQuantity  || 0,
                  remainingQuantity:       oData.remainingQuantity || oData.totalQuantity,
                  actualPercentage:        oData.actualPercentage || 0,
                  totalHeader:             oData.totalHeader      || 0,
                  // FIX: carry over-fulfillment settings from the execution order.
                  // onSaveEdit sends these to calculateQuantities which enforces the
                  // allowed-quantity ceiling (mirrors Spring Boot /quantities logic).
                  overFulfillmentPercent:  oData.overFulfillmentPercent || 0,
                  unlimitedOverFulfillment: !!oData.unlimitedOverFulfillment
                });



              });

              oMainModel.setProperty("/MainItems", aMainItems);

              var oExecTable = oView.byId("debitmemoTable");
              if (oExecTable && oExecTable.getBinding("rows")) {
                oExecTable.getBinding("rows").refresh();
              }

               const mainItems = oMainModel.getProperty("/MainItems")
              // Calculate the total sum
               this.totalValue = mainItems.reduce(
                (sum, record) => sum + Number(record.total || 0),
                0
              );
              console.log(this.totalValue);
               oModel.setProperty("/totalValue", this.totalValue);

              console.log(" MainItems after copy:", oMainModel.getProperty("/MainItems"));
              sap.m.MessageToast.show("Selected rows copied to Main Items table!");
              oDialog.close();
            }
          }),
          new sap.m.Button({
            text: "Cancel",
            type: "Reject",
            press: function () {
              oDialog.close();
            }
          })
        ]
      });

      // Create orders list
      var oTable = new sap.m.Table({
        mode: "MultiSelect",
        inset: false,
        columns: [
          new sap.m.Column({ header: new sap.m.Label({ text: "MainItem.NO" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Service Number" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Description" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "UOM" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Quantity" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "AmountPerUnit" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Currency" }) })
        ]
      });

      oDialog.addContent(oTable);

      // Fetch orders data
      $.ajax({
        url: `./odata/v4/sales-cloud/fetchExecutionOrderMainByDebitMemo?debitMemoRequest='${docNumber}'&debitMemoRequestItem='${itemNumber}'`,
        method: "GET",
        success: function (data) {
          var oModel = new sap.ui.model.json.JSONModel(data.value || data);
          oTable.setModel(oModel);
          oTable.bindItems("/", new sap.m.ColumnListItem({
            cells: [
              new sap.m.Text({ text: "{executionOrderMainCode}" }),  // FIX 5 (was invoiceMainItemCode — wrong field)
              new sap.m.Text({ text: "{serviceNumberCode}" }),
              new sap.m.Text({ text: "{description}" }),
              new sap.m.Text({ text: "{unitOfMeasurementCode}" }),
              new sap.m.Text({ text: "{totalQuantity}" }),
              new sap.m.Text({ text: "{amountPerUnit}" }),
              new sap.m.Text({ text: "{currencyCode}" })
            ]
          }));
        },
        error: function () {
          sap.m.MessageToast.show("Failed to fetch orders data.");
        }
      });

      oDialog.open();
    },

    onDeleteItem: function (oEvent) {
      var oBindingContext = oEvent.getSource().getBindingContext();
      if (oBindingContext) {
        var sPath = oBindingContext.getPath();
        var oModel = this.getView().getModel();
        var oItem = oModel.getProperty(sPath);

        sap.m.MessageBox.confirm(
          "Are you sure you want to delete item " + (oItem.serviceInvoiceCode || "") + "?",
          {
            title: "Confirm Deletion",
            onClose: function (oAction) {
              if (oAction === sap.m.MessageBox.Action.OK) {
                var aItems = oModel.getProperty("/MainItems");
                var iIndex = parseInt(sPath.split("/")[2]);
                if (iIndex > -1) {
                  aItems.splice(iIndex, 1);
                  oModel.setProperty("/MainItems", aItems);

                  const mainItems = oModel.getProperty("/MainItems")
                  // Calculate the total sum
                  this.totalValue = mainItems.reduce(
                    (sum, record) => sum + Number(record.total || 0),
                    0
                  );
                  console.log(this.totalValue);
                  oModel.setProperty("/totalValue", this.totalValue);

                  oModel.refresh(true);
                  sap.m.MessageToast.show("Item deleted successfully!");
                }
              }
            }
          }
        );
      }
    },
    onSaveDocument: function () {
      const oModel = this.getView().getModel(); // default model
      const MainItems = oModel.getProperty("/MainItems") || [];

      // Map MainItems to match API payload structure
      const serviceInvoiceCommands = MainItems.map(item => ({
        actualPercentage: parseInt(item.actualPercentage || "0"),
        actualQuantity: String(item.actualQuantity || "0"),
        alternatives: null,
        amountPerUnit: String(item.amountPerUnit || "0"),
        biddersLine: item.biddersLine !== undefined ? item.biddersLine : true,
        currencyCode: item.currencyCode || null,
        currentPercentage: item.totalQuantity > 0 ? Math.round((parseFloat(item.actualQuantity || 0) / parseFloat(item.totalQuantity)) * 100 * 1000) / 1000 : 0,
        debitMemoRequestItem: item.debitMemoRequestItem || "10",
        debitMemoRequestItemText: null,
        description: item.description || null,
        doNotPrint: item.doNotPrint !== undefined ? item.doNotPrint : true,
        executionOrderMainCode: item.executionOrderMainCode || null,
        externalServiceNumber: item.externalServiceNumber || null,
        lineNumber: item.lineNumber || null,
        lineText: item.lineText || null,
        lineTypeCode: item.lineTypeCode || null,
        lotCostOne: item.lotCostOne !== undefined ? item.lotCostOne : true,
        materialGroupCode: item.materialGroupCode || null,

        overFulfillmentPercent: String(item.overFulfillmentPercent || "0"),
        personnelNumberCode: item.personnelNumberCode || null,
        // quantity = this invoice's billed qty (per-invoice, NOT cumulative actualQuantity)
        quantity: String(item.quantity || item.currentQuantity || "0"),
        referenceId: oModel.getProperty("/docNumber") || "70000000",
        referenceSDDocument: item.referenceSDDocument || "2",
        remainingQuantity: String(item.remainingQuantity || "0"),
        //serviceInvoiceCode: item.serviceInvoiceCode || null,
        serviceNumberCode: parseInt(item.serviceNumberCode) || 0,
        //serviceNumber_serviceNumberCode: null,
        serviceText: item.serviceText || null,
        serviceTypeCode: item.serviceTypeCode || null,
        supplementaryLine: item.supplementaryLine !== undefined ? item.supplementaryLine : true,
        temporaryDeletion: null,
        total: String(item.total || "0"),
        totalHeader: String(item.totalHeader || "0"),
        totalQuantity: String(item.totalQuantity || "0"),
        unitOfMeasurementCode: item.unitOfMeasurementCode || null,
        unlimitedOverFulfillment: item.unlimitedOverFulfillment !== undefined ? item.unlimitedOverFulfillment : true
      }));
      const body = {
        serviceInvoiceCommands: serviceInvoiceCommands,
        debitMemoRequest: oModel.getProperty("/docNumber") || "",
        debitMemoRequestItem: oModel.getProperty("/itemNumber") || "",
        pricingProcedureStep: 20,
        pricingProcedureCounter: 1,
        customerNumber: "120000"
        // oModel.getProperty("/customerNumber") || "120000"
      };

      console.log("Payload sent to API:", body);

      fetch("./odata/v4/sales-cloud/saveOrUpdateServiceInvoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
        .then(response => {
          if (!response.ok) {
            throw new Error("Failed to save: " + response.statusText);
          }
          return response.json();
        })
        .then(savedItem => {
          console.log(savedItem);
          const oldItems = oModel.getProperty("/MainItems");
          const newItems = savedItem.value.map((newItem, index) => {
            const oldItem = oldItems[index];
            return {
              ...oldItem,
              ...newItem,
              executionOrderMainCode: oldItem.executionOrderMainCode || newItem.executionOrderMainCode || null,
              // Preserve these fields from oldItem if the backend response does not return them
              unitOfMeasurementCode: newItem.unitOfMeasurementCode || oldItem.unitOfMeasurementCode || null,
              currencyCode: newItem.currencyCode || oldItem.currencyCode || null,
              description: newItem.description || oldItem.description || null,
              serviceNumberCode: newItem.serviceNumberCode || oldItem.serviceNumberCode || null
            };
          });
          oModel.setProperty("/MainItems", newItems);

          // Recalculate totalValue from the freshly saved items
          const savedTotal = newItems.reduce((sum, r) => sum + Number(r.total || 0), 0);
          oModel.setProperty("/totalValue", savedTotal);

          sap.m.MessageToast.show("Document saved successfully!");

        })
        .catch(err => {
          console.error("Error saving document:", err);
          sap.m.MessageBox.error("Error: " + err.message);
        });
    },

    onPrint: function () {

    },
    onImport: function () {
      //Open Dialog built automatically
      if (!this._oValueHelpDialog) {
        this._oValueHelpDialog = new sap.m.Dialog({
          title: "Import From:",
          content: [
            new sap.m.HBox({
              justifyContent: "SpaceAround",
              class: "sapUiSmallMargin",
              items: [
                new sap.m.Button({
                  text: "Quotations?",
                  type: "Emphasized",
                }),
                new sap.m.Button({
                  text: "Model?",
                  type: "Emphasized",
                }),
                new sap.m.Button({
                  text: "Excel?",
                  type: "Emphasized",
                })
              ]
            })
          ]
          //       buttons: [
          //       new sap.m.Button({
          //       text: "Option 1",
          //       type: "Emphasized",
          //       press: function () {
          //           sap.m.MessageToast.show("Option 1 clicked");
          //       }
          //   }),
          //   new sap.m.Button({
          //       text: "Option 2",
          //       type: "Default",
          //       press: function () {
          //           sap.m.MessageToast.show("Option 2 clicked");
          //       }
          //   }),
          // ]


        });
      }
      this._oValueHelpDialog.open();


    },
    onAddIem: function () {
      //Calc total Amount  = QTY * Amount Per Unit 
      //Re-Render
      this.byId("_IDGenText1").setText();

      var oModel = this.getView().getModel();
      var oData = oModel.getProperty("/Items");
      var total = 0;
      oData.forEach(oRow => {
        var price = oRow.AmountPerUnit;
        var qty = oRow.QTY;
        var multiply = price * qty;
        //Set Value in total Col.
        oRow.Total = multiply;
        total += multiply;
      });
      //Update Model with Calculated Total
      oModel.setProperty("/Items", oData);
      if (total) {
        //Set Value
        this.byId("_IDGenText1").setText(total);
      }
    },
    onEditItem: function (oEvent) {
      const oButton = oEvent.getSource();
      const oContext = oButton.getBindingContext();

      if (!oContext) {
        sap.m.MessageToast.show("No item context found.");
        return;
      }

      const oData = oContext.getObject();
      const oModel = this.getView().getModel();

      // Save the path for later update
      this._editPath = oContext.getPath();

      // Clone the selected row’s data into a temporary model property
      oModel.setProperty("/editRow", { ...oData });

      // Create the dialog only once
      if (!this._EditItemDialog) {
        const oForm = new sap.ui.layout.form.SimpleForm({
          layout: "ResponsiveGridLayout",
          editable: true,
          labelSpanXL: 4,
          labelSpanL: 4,
          labelSpanM: 4,
          labelSpanS: 12,
          content: [
            new sap.m.Label({ text: "Service No." }),
            new sap.m.Input({ value: "{/editRow/serviceNumberCode}", editable: false }),

            new sap.m.Label({ text: "Description" }),
            new sap.m.Input({ value: "{/editRow/description}", editable: false }),

            new sap.m.Label({ text: "UOM" }),
            new sap.m.Input({ value: "{/editRow/unitOfMeasurementCode}", editable: false }),

            new sap.m.Label({ text: "Amount Per Unit" }),
            new sap.m.Input({
              value: "{/editRow/amountPerUnit}", editable: false,
              type: "Number",
              //liveChange: this._onValueChange.bind(this)
            }),

            new sap.m.Label({ text: "Total Quantity (Planned)" }),
            new sap.m.Input({
              value: "{/editRow/totalQuantity}", editable: false,  // FIX D: was {/editRow/total} — showed money, not qty
              type: "Number"
            }),

            new sap.m.Label({ text: "Current Quantity" }),
            new sap.m.Input({
              value: "{/editRow/currentQuantity}",
              type: "Number",
              valueLiveUpdate: true,  // Add this line
              //liveChange: this._onValueChange.bind(this)
            }),

            new sap.m.Label({ text: "Remaining Quantity" }),
            new sap.m.Input({ value: "{/editRow/remainingQuantity}", editable: false }),

            new sap.m.Label({ text: "Actual Total Quantity" }),
            new sap.m.Input({ value: "{/editRow/actualQuantity}", editable: false }),

            new sap.m.Label({ text: "Actual Total Percentage %" }),
            new sap.m.Input({ value: "{/editRow/actualPercentage}", editable: false }),

            new sap.m.Label({ text: "Current Percentage" }),
            new sap.m.Input({ value: "{/editRow/currentPercentage}", editable: false }),

            new sap.m.Label({ text: "Currency" }),
            new sap.m.Input({ value: "{/editRow/currencyCode}", editable: false }),

            new sap.m.Label({ text: "Material Group" }),
            new sap.m.Input({ value: "{/editRow/materialGroupCode}", editable: false }),

            new sap.m.Label({ text: "Service Type" }),
            new sap.m.Input({ value: "{/editRow/serviceTypeCode}", editable: false }),

            new sap.m.Label({ text: "External Service Number" }),
            new sap.m.Input({ value: "{/editRow/externalServiceNumber}", editable: false }),

            new sap.m.Label({ text: "Service Text" }),
            new sap.m.Input({ value: "{/editRow/serviceText}", editable: false }),

            new sap.m.Label({ text: "Line Text" }),
            new sap.m.Input({ value: "{/editRow/lineText}", editable: false }),

            new sap.m.Label({ text: "Personnel No." }),
            new sap.m.Input({ value: "{/editRow/personnelNumberCode}", editable: false }),

            new sap.m.Label({ text: "Line Type" }),
            new sap.m.Input({ value: "{/editRow/lineTypeCode}", editable: false }),

            new sap.m.Label({ text: "Bidders' Line" }),
            new sap.m.CheckBox({ selected: "{/editRow/biddersLine}", editable: false }),

            new sap.m.Label({ text: "Supplementary Line" }),
            new sap.m.CheckBox({ selected: "{/editRow/supplementaryLine}", editable: false }),

            new sap.m.Label({ text: "Lot Cost One" }),
            new sap.m.CheckBox({ selected: "{/editRow/lotCostOne}", editable: false }),

            new sap.m.Label({ text: "Current Amount" }),
            new sap.m.Input({ value: "{/editRow/total}", editable: false }),

            // FIX: show over-fulfillment limits so the user knows the ceiling
            // before entering a Current Quantity value.
            new sap.m.Label({ text: "Over Fulfillment %" }),
            new sap.m.Input({
              value: "{/editRow/overFulfillmentPercent}",
              editable: false,
              tooltip: "Maximum additional quantity allowed as a % of Total Quantity"
            }),

            new sap.m.Label({ text: "Unlimited Over Fulfillment" }),
            new sap.m.CheckBox({
              selected: "{/editRow/unlimitedOverFulfillment}",
              editable: false,
              text: "No quantity limit enforced"
            })
          ]
        });

        this._EditItemDialog = new sap.m.Dialog({
          title: "Edit Debit Memo Item",
          contentWidth: "700px",
          resizable: true,
          draggable: true,
          content: [oForm],
          beginButton: new sap.m.Button({
            text: "Save",
            type: "Emphasized",
            press: this.onSaveEdit.bind(this)
          }),
          endButton: new sap.m.Button({
            text: "Cancel",
            press: function () {
              this._EditItemDialog.close();
              this._EditItemDialog.destroy();
              this._EditItemDialog = null;
            }.bind(this)
          })
        });

        this.getView().addDependent(this._EditItemDialog);
      }

      this._EditItemDialog.open();
    },
    onSaveEdit: function () {
      const oModel = this.getView().getModel();
      const oEditRow = oModel.getProperty("/editRow");

      // FIX 1: totalQuantity must be the PLANNED order quantity, NOT the monetary total.
      // The backend uses it to compute: remainingQty = totalQuantity - currentQuantity
      // and actualPercentage = (currentQuantity / totalQuantity) * 100
      // Store the per-invoice qty so it can be saved and displayed correctly,
      // independent of the cumulative actualQuantity set by calculateQuantities.
      oEditRow.quantity = parseFloat(oEditRow.currentQuantity) || 0;

      const payload = {
        executionOrderMainCode:    oEditRow.executionOrderMainCode,
        quantity:                  oEditRow.quantity,
        totalQuantity:             parseFloat(oEditRow.totalQuantity)          || 0,
        amountPerUnit:             parseFloat(oEditRow.amountPerUnit)          || 0,
        overFulfillmentPercentage: parseFloat(oEditRow.overFulfillmentPercent) || 0,
        unlimitedOverFulfillment:  !!oEditRow.unlimitedOverFulfillment
      };

      console.log("Payload sent to /calculateQuantities:", payload);

      // FIX 3: all model updates AND dialog close must happen INSIDE .then()
      // so calculated values from the API are saved before the dialog closes.
      fetch("./odata/v4/sales-cloud/calculateQuantities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(res => {
          // FIX: extract the real CAP/backend error message (e.g.
          // "Quantity exceeds allowed limit") instead of a generic string.
          if (!res.ok) {
            return res.json().then(function (errBody) {
              var msg = (errBody && errBody.error && errBody.error.message)
                ? errBody.error.message
                : ("Server error: " + res.status);
              throw new Error(msg);
            }).catch(function () {
              throw new Error("Server error: " + res.status);
            });
          }
          return res.json();
        })
        .then(result => {
          console.log("Calculation API response:", result);

          // calculateQuantities returns the full tempData object.
          // actualQuantity = cumulative (postedAQ + this qty) — for "Actual Total Quantity" column
          // total          = this invoice only (qty * amountPerUnit)
          // totalHeader    = cumulative monetary total
          const rv = (result && result.value !== undefined) ? result.value : result;
          oEditRow.actualQuantity    = rv.actualQuantity;    // cumulative
          oEditRow.remainingQuantity = rv.remainingQuantity;
          oEditRow.actualPercentage  = rv.actualPercentage;  // cumulative %
          oEditRow.totalHeader       = rv.totalHeader;       // cumulative amount
          oEditRow.total             = oEditRow.quantity * (parseFloat(oEditRow.amountPerUnit) || 0); // this invoice only

          // Write updated row back to the model AND to the main table row
          oModel.setProperty("/editRow", oEditRow);
          if (this._editPath) {
            oModel.setProperty(this._editPath, oEditRow);  // FIX 3 (was updatedData — stale)
          }

          const mainItems = oModel.getProperty("/MainItems") || [];
          const totalValue = mainItems.reduce((sum, r) => sum + Number(r.total || 0), 0);
          oModel.setProperty("/totalValue", totalValue);

          this._EditItemDialog.close();    // FIX 3 (was outside .then — race condition)
          this._EditItemDialog.destroy();
          this._EditItemDialog = null;
          sap.m.MessageToast.show("Item updated successfully!");
        })
        .catch(err => {
          console.error("Error calling calculateQuantities:", err);
          // FIX: show the actual backend message (e.g. over-fulfillment rejection)
          sap.m.MessageBox.error(err.message || "Failed to calculate quantities. Please try again.");
        });
    },
    _onValueChange: function () {
      const oModel = this.getView().getModel();

      // Prepare request payload

    }







  });
});