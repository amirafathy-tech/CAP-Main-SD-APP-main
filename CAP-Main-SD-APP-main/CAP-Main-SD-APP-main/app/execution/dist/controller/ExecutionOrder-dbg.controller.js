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
], (Controller, FileUploader, SimpleForm, ResponsiveGridLayout) => {
  "use strict";

  return Controller.extend("execution.controller.ExecutionOrder", {
    onInit() {
      var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
      oRouter.getRoute("ExecutionOrder").attachPatternMatched(this._onRouteMatched, this);
      var oModel = new sap.ui.model.json.JSONModel({
        totalValue: 0,
        docNumber: "",
        itemNumber: "",
        MainItems: [],
        Uom: [],
        ServiceTypes: [],
        MaterialGroup: [],
        ServiceNumbers: [],
        Currencies: []
      });
      this.getView().setModel(oModel);

      // FIX: absolute paths so cds-plugin-ui5 mount prefix doesn't interfere
      fetch("./odata/v4/sales-cloud/ServiceNumbers")
        .then(response => {
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        })
        .then(data => {
          if (data && data.value) {
            const ServiceNumbers = data.value.map(item => ({
              serviceNumberCode: item.serviceNumberCode,
              description: item.description
            }));
            this.getView().getModel().setProperty("/ServiceNumbers", ServiceNumbers);
          }
        })
        .catch(err => console.error("Error fetching ServiceNumbers:", err));

      fetch("./odata/v4/sales-cloud/UnitOfMeasurements")
        .then(r => r.json())
        .then(data => {
          if (data && data.value) {
            // FIX: store as {code, description} — that's what the entity exposes
            const UOM = data.value.map(item => ({
              code: item.code,
              description: item.description
            }));
            this.getView().getModel().setProperty("/Uom", UOM);
          }
        });

      fetch("./odata/v4/sales-cloud/ServiceTypes")
        .then(response => {
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        })
        .then(data => {
          if (data && data.value) {
            const ServiceTypes = data.value.map(item => ({
              serviceTypeCode: item.serviceTypeCode,
              description: item.description
            }));
            this.getView().getModel().setProperty("/ServiceTypes", ServiceTypes);
          }
        })
        .catch(err => console.error("Error fetching ServiceTypes:", err));

      fetch("./odata/v4/sales-cloud/MaterialGroups")
        .then(response => {
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        })
        .then(data => {
          if (data && data.value) {
            const MaterialGroups = data.value.map(item => ({
              materialGroupCode: item.materialGroupCode,
              description: item.description
            }));
            this.getView().getModel().setProperty("/MaterialGroup", MaterialGroups);
          }
        })
        .catch(err => console.error("Error fetching MaterialGroups:", err));

      fetch("./odata/v4/sales-cloud/Currencies")
        .then(response => {
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        })
        .then(data => {
          if (data && data.value) {
            const Currencies = data.value.map(item => ({
              currencyCode: item.currencyCode, // UUID key
              code: item.code,                 // actual currency string e.g. "SAR"
              description: item.description
            }));
            this.getView().getModel().setProperty("/Currencies", Currencies);
          }
        })
        .catch(err => console.error("Error fetching Currencies:", err));
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

      // FIX: absolute path
      var sUrl = `./odata/v4/sales-cloud/getExecutionOrderMainByReferenceId?referenceId='${docNumber}'&salesOrderItem='${itemNumber}'`;

      fetch(sUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      })
        .then(response => response.json())
        .then(data => {
          const mainItems = Array.isArray(data.value) ? data.value : [];
          const totalValue = mainItems.reduce((sum, record) => sum + Number(record.total || 0), 0);
          oModel.setProperty("/MainItems", data.value);
          oModel.setProperty("/totalValue", totalValue);
          oView.byId("executionTable").setModel(oModel);
        })
        .catch(err => console.error("Error fetching MainItems", err));
    },

    onSearchItem: function (oEvent) {
      var sQuery = oEvent.getSource().getValue();
      var oTable = this.byId("_IDGenTable");
      var oBinding = oTable.getBinding("rows");
      var aFilters = [];
      if (sQuery && sQuery.length > 0) {
        new sap.ui.model.Filter("MainItemNo", sap.ui.model.FilterOperator.EQ, sQuery);
        var oFinalFilter = new sap.ui.model.Filter({ filters: aFilters, and: false });
        oBinding.filter([oFinalFilter]);
      } else {
        oBinding.filter([]);
      }
    },

    onPrint: function () { },

    onExport: function () {
      var oModel = this.getView().getModel();
      var aCols = [
        { label: "executionOrderMainCode.", property: "executionOrderMainCode" },
        { label: "lineNumber", property: "lineNumber" },
        { label: "serviceNumberCode", property: "serviceNumberCode" },
        { label: "description", property: "description" },
        { label: "quantity", property: "totalQuantity" },
        { label: "actualQuantity", property: "actualQuantity" },
        { label: "unitOfMeasurementCode", property: "unitOfMeasurementCode" },
        { label: "amountPerUnit", property: "amountPerUnit" },
        { label: "currencyCode", property: "currencyCode" },
        { label: "total", property: "total" },
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
        fileName: "Execution Order Items.xlsx"
      };
      var oSpreadsheet = new sap.ui.export.Spreadsheet(oSettings);
      oSpreadsheet.build().finally(function () { oSpreadsheet.destroy(); });
    },

    onImport: function () {
      var that = this;
      if (!this._oValueHelpDialog) {
        this._oValueHelpDialog = new sap.m.Dialog({
          title: "Import From:",
          contentWidth: "400px",
          contentHeight: "150px",
          resizable: false,
          draggable: true,
          content: new sap.m.HBox({
            justifyContent: "SpaceAround",
            alignItems: "Center",
            items: [
              new sap.m.Button({
                text: "Quotations",
                type: "Emphasized",
                press: function () {
                  that._oValueHelpDialog.close();
                  that._openQuotationsDialog();
                }
              }),
              new sap.m.Button({
                text: "Models",
                type: "Emphasized",
                press: function () {
                  that._oValueHelpDialog.close();
                  that._openModelsDialog();
                }
              }),
              new sap.m.Button({
                text: "Excel",
                type: "Emphasized",
                press: function () {
                  that._oValueHelpDialog.close();
                  that._openExcelUploadDialog();
                }
              })
            ]
          }),
          beginButton: new sap.m.Button({
            text: "Cancel",
            type: "Reject",
            press: function () { that._oValueHelpDialog.close(); }
          })
        });
      }
      this._oValueHelpDialog.open();
    },

    _openQuotationsDialog: function () {
      var that = this;
      var oView = this.getView();
      var oModel = oView.getModel();

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

              var oMainModel = oView.getModel();
              var aMainItems = oMainModel.getProperty("/MainItems") || [];

              aSelectedItems.forEach(function (oItem) {
                var oData = oItem.getBindingContext().getObject();

                // FIX 1: quantity goes to totalQuantity (the QTY column), NOT actualQuantity
                aMainItems.push({
                  executionOrderMainCode: oData.invoiceMainItemCode,
                  lineNumber: "",
                  serviceNumberCode: oData.serviceNumberCode,
                  description: oData.description,
                  totalQuantity: oData.quantity,       // FIX: was actualQuantity — wrong field
                  actualQuantity: 0,                   // starts at 0; user fills in during execution
                  unitOfMeasurementCode: oData.unitOfMeasurementCode,
                  amountPerUnit: oData.amountPerUnit,
                  currencyCode: oData.currencyCode,
                  total: oData.quantity * oData.amountPerUnit
                });
              });

              oMainModel.setProperty("/MainItems", aMainItems);

              var oExecTable = oView.byId("executionTable");
              if (oExecTable && oExecTable.getBinding("rows")) {
                oExecTable.getBinding("rows").refresh();
              }

              var totalValue = (oMainModel.getProperty("/MainItems") || []).reduce(
                (sum, record) => sum + Number(record.total || 0), 0
              );
              oMainModel.setProperty("/totalValue", totalValue);

              sap.m.MessageToast.show("Selected rows copied to Main Items table!");
              oDialog.close();
            }
          }),
          new sap.m.Button({
            text: "Cancel",
            type: "Reject",
            press: function () { oDialog.close(); }
          })
        ]
      });

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

      // The InvoiceMainItems (quotation items) have referenceId = the quotation number (referenceSDDocument).
      // The current sales order's referenceSDDocument is stored on each loaded execution order.
      // Use it to filter InvoiceMainItems to show only items from the referenced quotation.
      var oMainModel = oView.getModel();
      var aMainItems = oMainModel.getProperty("/MainItems") || [];
      var sRefSDDoc = aMainItems.length > 0 ? (aMainItems[0].referenceSDDocument || "") : "";

      // Mirror Spring Boot findBySalesOrderAndItem → to_SalesOrder → ReferenceSDDocument
      // If sRefSDDoc is already known (orders saved), use it directly.
      // If not (first time, no saved orders), call findBySalesOrderAndItem which navigates
      // A_SalesOrderItem/to_SalesOrder to get ReferenceSDDocument from the header.
      var fnLoadQuotationItems = function (referenceId) {
        console.log("fetchByReferenceId:", { referenceId: referenceId });
        fetch("./odata/v4/sales-cloud/fetchByReferenceId", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referenceId: referenceId })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var oTableModel = new sap.ui.model.json.JSONModel(data.value || data || []);
            oTable.setModel(oTableModel);
            oTable.bindItems("/", new sap.m.ColumnListItem({
              cells: [
                new sap.m.Text({ text: "{invoiceMainItemCode}" }),
                new sap.m.Text({ text: "{serviceNumberCode}" }),
                new sap.m.Text({ text: "{description}" }),
                new sap.m.Text({ text: "{unitOfMeasurementCode}" }),
                new sap.m.Text({ text: "{quantity}" }),
                new sap.m.Text({ text: "{amountPerUnit}" }),
                new sap.m.Text({ text: "{currencyCode}" })
              ]
            }));
          })
          .catch(function () {
            sap.m.MessageToast.show("Failed to fetch quotations data.");
          });
      };

      if (sRefSDDoc) {
        fnLoadQuotationItems(sRefSDDoc);
      } else {
        // No saved execution orders yet — ask S4 via findBySalesOrderAndItem.
        // The CAP handler navigates A_SalesOrderItem(..)/to_SalesOrder which
        // returns the sales order HEADER, and the header has ReferenceSDDocument.
        var sSalesOrder   = oModel.getProperty("/docNumber") || "";
        var sSalesOrderItem = oModel.getProperty("/itemNumber") || "";
        fetch("./odata/v4/sales-cloud/findBySalesOrderAndItem?salesOrder='"
              + sSalesOrder + "'&salesOrderItem='" + sSalesOrderItem + "'")
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var sRaw = typeof data.value === "string" ? data.value : JSON.stringify(data.value || "");
            var oHeader = {};
            try { oHeader = JSON.parse(sRaw); } catch (e) { oHeader = data.value || {}; }
            // response is { d: { ReferenceSDDocument: "20000071", ... } }
            var sRef = (oHeader.d && oHeader.d.ReferenceSDDocument) || "";
            if (!sRef) {
              sap.m.MessageToast.show("No Quotation reference found for this Sales Order.");
              return;
            }
            console.log("Resolved ReferenceSDDocument from S4:", sRef);
            fnLoadQuotationItems(sRef);
          })
          .catch(function () {
            sap.m.MessageToast.show("Failed to resolve Sales Order reference from S4.");
          });
      }

      oDialog.open();
    },

    _openModelsDialog: function () {
      var that = this;

      var oDialog = new sap.m.Dialog({
        title: "Models List",
        contentWidth: "80%",
        contentHeight: "60%",
        resizable: true,
        draggable: true,
        buttons: [
          new sap.m.Button({
            text: "Close",
            press: function () { oDialog.close(); }
          })
        ]
      });

      var oTable = new sap.m.Table({
        inset: false,
        columns: [
          new sap.m.Column({ header: new sap.m.Label({ text: "Model ID" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Model Spec" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Model Description" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Currency" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Services" }) })
        ]
      });

      oDialog.addContent(oTable);

      // FIX: absolute path
      fetch("./odata/v4/sales-cloud/ModelSpecifications")
        .then(response => response.json())
        .then(data => {
          var oModel = new sap.ui.model.json.JSONModel(data);
          oTable.setModel(oModel);
          oTable.bindItems("/value", new sap.m.ColumnListItem({
            cells: [
              new sap.m.Text({ text: "{modelSpecCode}" }),
              new sap.m.Text({ text: "{modelServSpec}" }),
              new sap.m.Text({ text: "{description}" }),
              new sap.m.Text({ text: "{currencyCode}" }),
              new sap.m.Button({
                text: "Services",
                type: "Emphasized",
                press: function (oEvent) {
                  var sModelCode = oEvent.getSource().getBindingContext().getProperty("modelSpecCode");
                  that._getModelServices(sModelCode);
                }
              })
            ]
          }));
        })
        .catch(function () {
          sap.m.MessageToast.show("Failed to fetch models data.");
        });

      oDialog.open();
    },

    _getModelServices: function (modelSpecCode) {
      var that = this;

      var oDialog = new sap.m.Dialog({
        title: "Services for Model: " + modelSpecCode,
        contentWidth: "70%",
        contentHeight: "50%",
        resizable: true,
        draggable: true,
        buttons: [
          new sap.m.Button({
            text: "Copy Selected",
            type: "Emphasized",
            press: function () {
              var aSelectedItems = oTable.getSelectedItems();
              if (aSelectedItems.length === 0) {
                sap.m.MessageToast.show("Please select at least one service to copy.");
                return;
              }
              var oView = that.getView();
              var oMainModel = oView.getModel();
              var aMainItems = oMainModel.getProperty("/MainItems") || [];
              aSelectedItems.forEach(function (oItem) {
                var oServiceData = oItem.getBindingContext().getObject();
                aMainItems.push({
                  serviceNumberCode: oServiceData.serviceNumberCode,
                  unitOfMeasurementCode: oServiceData.unitOfMeasurementCode,
                  currencyCode: oServiceData.currencyCode,
                  description: oServiceData.shortText,
                  materialGroupCode: oServiceData.materialGroupCode,
                  serviceTypeCode: oServiceData.serviceTypeCode,
                  personnelNumberCode: oServiceData.personnelNumberCode,
                  lineTypeCode: oServiceData.lineTypeCode,
                  totalQuantity: oServiceData.quantity,
                  amountPerUnit: oServiceData.grossPrice,
                  total: oServiceData.netValue,
                  actualQuantity: oServiceData.actualQuantity,
                  actualPercentage: oServiceData.actualPercentage,
                  overFulfillmentPercentage: oServiceData.overFulfilmentPercentage,
                  unlimitedOverFulfillment: oServiceData.unlimitedOverFulfillment,
                  manualPriceEntryAllowed: oServiceData.manualPriceEntryAllowed,
                  externalServiceNumber: oServiceData.externalServiceNumber,
                  serviceText: oServiceData.serviceText,
                  lineText: oServiceData.lineText,
                  lineNumber: oServiceData.lineNumber,
                  biddersLine: oServiceData.biddersLine,
                  supplementaryLine: oServiceData.supplementaryLine,
                  lotCostOne: oServiceData.lotSizeForCostingIsOne
                });
              });
              oMainModel.setProperty("/MainItems", aMainItems);

              var totalValue = (oMainModel.getProperty("/MainItems") || []).reduce(
                (sum, record) => sum + Number(record.total || 0), 0
              );
              oMainModel.setProperty("/totalValue", totalValue);

              oView.byId("executionTable").getBinding("rows").refresh();
              sap.m.MessageToast.show("Selected services copied to Main Items table.");
              oDialog.close();
            }
          }),
          new sap.m.Button({
            text: "Close",
            press: function () { oDialog.close(); }
          })
        ]
      });

      var oTable = new sap.m.Table({
        mode: "MultiSelect",
        inset: false,
        columns: [
          new sap.m.Column({ header: new sap.m.Label({ text: "Service ID" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Service Number" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Description" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "UOM" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Quantity" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Amount/Unit" }) }),
          new sap.m.Column({ header: new sap.m.Label({ text: "Currency" }) })
        ]
      });

      oDialog.addContent(oTable);

      // FIX: absolute path
      fetch(`./odata/v4/sales-cloud/ModelSpecificationsDetails`)
        .then(response => response.json())
        .then(data => {
          var oModel = new sap.ui.model.json.JSONModel(data);
          oTable.setModel(oModel);
          oTable.bindItems("/value", new sap.m.ColumnListItem({
            type: "Active",
            cells: [
              new sap.m.Text({ text: "{modelSpecDetailsCode}" }),
              new sap.m.Text({ text: "{serviceText}" }),
              new sap.m.Text({ text: "{shortText}" }),
              new sap.m.Text({ text: "{unitOfMeasurementCode}" }),
              new sap.m.Text({ text: "{quantity}" }),
              new sap.m.Text({ text: "{pricePerUnitOfMeasurement}" }),
              new sap.m.Text({ text: "{currencyCode}" })
            ]
          }));
        })
        .catch(function () {
          sap.m.MessageToast.show("Failed to fetch services for this model.");
        });

      oDialog.open();
    },

    _openExcelUploadDialog: function () {
      var that = this;
      var selectedFile;
      const oView = this.getView();
      const oMainModel = oView.getModel();

      var oFileUploader = new sap.ui.unified.FileUploader({
        width: "100%",
        fileType: ["xls", "xlsx"],
        sameFilenameAllowed: true,
        change: function (oEvent) {
          selectedFile = oEvent.getParameter("files")[0];
        }
      });

      var oDialogContent = new sap.m.VBox({ items: [oFileUploader] });
      var oExcelTable;

      var oExcelDialog = new sap.m.Dialog({
        title: "Import Executions from Excel",
        contentWidth: "80%",
        contentHeight: "70%",
        content: [oDialogContent],
        buttons: [
          new sap.m.Button({
            text: "Add Selected",
            type: "Emphasized",
            press: function () {
              if (!oExcelTable) return;
              const aMainItems = oMainModel.getProperty("/MainItems") || [];
              const rows = oExcelTable.getModel().getProperty("/rows");
              const selectedRows = rows.filter(r => r.selected);
              if (selectedRows.length === 0) {
                sap.m.MessageToast.show("Please select at least one row!");
                return;
              }
              selectedRows.forEach(row => {
                aMainItems.push({
                  executionOrderMainCode: row.executionOrderMainCode || "",
                  lineNumber: row.lineNumber || "",
                  serviceNumberCode: row.serviceNumberCode || "",
                  description: row.description || "",
                  totalQuantity: row.totalQuantity || 0,
                  actualQuantity: row.actualQuantity || 0,
                  unitOfMeasurementCode: row.unitOfMeasurementCode || "",
                  amountPerUnit: row.amountPerUnit || 0,
                  currencyCode: row.currencyCode || "",
                  total: row.total || 0,
                  actualPercentage: row.actualPercentage || 0,
                  overFulfillmentPercent: row.overFulfillmentPercent || 0,
                  unlimitedOverFulfillment: row.unlimitedOverFulfillment || false,
                  manualPriceEntryAllowed: row.manualPriceEntryAllowed || false,
                  materialGroupCode: row.materialGroupCode || "",
                  serviceTypeCode: row.serviceTypeCode || "",
                  externalServiceNumber: row.externalServiceNumber || "",
                  serviceText: row.serviceText || "",
                  lineText: row.lineText || "",
                  personnelNumberCode: row.personnelNumberCode || "",
                  lineTypeCode: row.lineTypeCode || "",
                  biddersLine: row.biddersLine || false,
                  supplementaryLine: row.supplementaryLine || false,
                  lotCostOne: row.lotCostOne || false
                });
              });
              oMainModel.setProperty("/MainItems", aMainItems);
              oMainModel.refresh(true);
              sap.m.MessageToast.show("Selected executions added successfully!");
              oExcelDialog.close();
            }
          }),
          new sap.m.Button({
            text: "Add All",
            press: function () {
              if (!oExcelTable) return;
              const rows = oExcelTable.getModel().getProperty("/rows");
              rows.forEach(r => r.selected = true);
              oExcelTable.getModel().refresh();
              oExcelDialog.getButtons()[0].firePress();
            }
          }),
          new sap.m.Button({
            text: "Cancel",
            press: function () { oExcelDialog.close(); }
          })
        ]
      });

      var handleFileRead = function () {
        if (!selectedFile) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: "array" });
          var sheet = workbook.Sheets[workbook.SheetNames[0]];
          var jsonData = XLSX.utils.sheet_to_json(sheet);
          jsonData.forEach(r => {
            r.selected = false;
            r.unlimitedOverFulfillment = r.unlimitedOverFulfillment === true || r.unlimitedOverFulfillment === "true";
            r.manualPriceEntryAllowed = r.manualPriceEntryAllowed === true || r.manualPriceEntryAllowed === "true";
            r.biddersLine = r.biddersLine === true || r.biddersLine === "true";
            r.supplementaryLine = r.supplementaryLine === true || r.supplementaryLine === "true";
            r.lotCostOne = r.lotCostOne === true || r.lotCostOne === "true";
          });

          var oExcelDataModel = new sap.ui.model.json.JSONModel({ rows: jsonData });
          oExcelTable = new sap.m.Table({
            width: "100%",
            columns: [
              new sap.m.Column({ header: new sap.m.Text({ text: "Select" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Execution No" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Line Number" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Service Code" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Quantity" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "UOM" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Amount Per Unit" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Total" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Currency" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Unlimited Over Fulfillment" }) }),
              new sap.m.Column({ header: new sap.m.Text({ text: "Manual Price Entry" }) })
            ]
          });

          oExcelTable.setModel(oExcelDataModel);
          oExcelTable.bindItems({
            path: "/rows",
            template: new sap.m.ColumnListItem({
              type: "Inactive",
              cells: [
                new sap.m.CheckBox({ selected: "{selected}" }),
                new sap.m.Text({ text: "{executionOrderMainCode}" }),
                new sap.m.Text({ text: "{lineNumber}" }),
                new sap.m.Text({ text: "{serviceNumberCode}" }),
                new sap.m.Text({ text: "{description}" }),
                new sap.m.Text({ text: "{totalQuantity}" }),
                new sap.m.Text({ text: "{unitOfMeasurementCode}" }),
                new sap.m.Text({ text: "{amountPerUnit}" }),
                new sap.m.Text({ text: "{total}" }),
                new sap.m.Text({ text: "{currencyCode}" }),
                new sap.m.CheckBox({ selected: "{unlimitedOverFulfillment}" }),
                new sap.m.CheckBox({ selected: "{manualPriceEntryAllowed}" })
              ]
            })
          });

          oDialogContent.addItem(oExcelTable);
        };
        reader.readAsArrayBuffer(selectedFile);
      };

      oFileUploader.attachChange(handleFileRead);
      oExcelDialog.open();
    },

    onEditItem: function (oEvent) {
      var oButton = oEvent.getSource();
      var oContext = oButton.getBindingContext();
      if (!oContext) {
        sap.m.MessageToast.show("No item context found.");
        return;
      }
      var oData = oContext.getObject();
      var oModel = this.getView().getModel();
      this._editPath = oContext.getPath();
      oModel.setProperty("/editRow", Object.assign({}, oData));

      if (!this._EditItemDialog) {
        var oForm = new sap.ui.layout.form.SimpleForm({
          layout: "ResponsiveGridLayout",
          editable: true,
          labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
          adjustLabelSpan: false,
          emptySpanXL: 1, emptySpanL: 1, emptySpanM: 1, emptySpanS: 0,
          columnsXL: 1, columnsL: 1, columnsM: 1,
          content: [
            new sap.m.Label({ text: "Service No" }),
            new sap.m.Input({ value: "{/editRow/serviceNumberCode}" }),

            new sap.m.Label({ text: "Description" }),
            new sap.m.Input({ value: "{/editRow/description}" }),

            new sap.m.Label({ text: "Quantity" }),
            new sap.m.Input({ value: "{/editRow/totalQuantity}", type: "Number", liveChange: this._onValueChange.bind(this) }),

            new sap.m.Label({ text: "UOM" }),
            // FIX 3: items template key must use {code} — that's what we store in /Uom array
            new sap.m.Select(this.createId("editUOM"), {
              selectedKey: "{/editRow/unitOfMeasurementCode}",
              forceSelection: false,
              change: function (oEvt) {
                // Explicitly write selected key back to model to survive re-render
                var sKey = oEvt.getParameter("selectedItem").getKey();
                oModel.setProperty("/editRow/unitOfMeasurementCode", sKey);
              },
              items: {
                path: "/Uom",
                template: new sap.ui.core.Item({
                  key: "{code}",          // FIX: was {unitOfMeasurementCode} — entity exposes {code}
                  text: "{description}"
                })
              }
            }),

            new sap.m.Label({ text: "Amount Per Unit" }),
            new sap.m.Input({ value: "{/editRow/amountPerUnit}", type: "Number", liveChange: this._onValueChange.bind(this) }),

            new sap.m.Label({ text: "Over Fulfillment %" }),
            new sap.m.Input({ value: "{/editRow/overFulfillmentPercent}", type: "Number" }),

            new sap.m.Label({ text: "Unlimited Over Fulfillment" }),
            new sap.m.CheckBox({ selected: "{/editRow/unlimitedOverFulfillment}" }),

            new sap.m.Label({ text: "Manual Price Entry Allowed" }),
            new sap.m.CheckBox({ selected: "{/editRow/manualPriceEntryAllowed}" }),

            new sap.m.Label({ text: "Material Group" }),
            new sap.m.Select(this.createId("editMaterialGroup"), {
              selectedKey: "{/editRow/materialGroupCode}",
              forceSelection: false,
              items: {
                path: "/MaterialGroup",
                template: new sap.ui.core.Item({
                  key: "{materialGroupCode}",
                  text: "{description}"
                })
              }
            }),

            new sap.m.Label({ text: "Service Type" }),
            new sap.m.Select(this.createId("editServiceType"), {
              selectedKey: "{/editRow/serviceTypeCode}",
              forceSelection: false,
              items: {
                path: "/ServiceTypes",
                template: new sap.ui.core.Item({
                  key: "{serviceTypeCode}",
                  text: "{description}"
                })
              }
            }),

            new sap.m.Label({ text: "External Service Number" }),
            new sap.m.Input({ value: "{/editRow/externalServiceNumber}" }),

            new sap.m.Label({ text: "Service Text" }),
            new sap.m.Input({ value: "{/editRow/serviceText}" }),

            new sap.m.Label({ text: "Line Text" }),
            new sap.m.Input({ value: "{/editRow/lineText}" }),

            new sap.m.Label({ text: "Personnel Number" }),
            new sap.m.Input({ value: "{/editRow/personnelNumberCode}" }),

            new sap.m.Label({ text: "Line Type" }),
            new sap.m.Input({ value: "{/editRow/lineTypeCode}" }),

            new sap.m.Label({ text: "Bidders Line" }),
            new sap.m.CheckBox({ selected: "{/editRow/biddersLine}" }),

            new sap.m.Label({ text: "Supplementary Line" }),
            new sap.m.CheckBox({ selected: "{/editRow/supplementaryLine}" }),

            new sap.m.Label({ text: "Lot Cost One" }),
            new sap.m.CheckBox({ selected: "{/editRow/lotCostOne}" }),

            new sap.m.Label({ text: "Total" }),
            new sap.m.Input({ value: "{/editRow/total}", editable: false })
          ]
        });

        this._EditItemDialog = new sap.m.Dialog({
          title: "Edit Item",
          contentWidth: "700px",
          contentHeight: "auto",
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

    _onValueChange: function (oEvent) {
      var oModel = this.getView().getModel();
      var oInput = oEvent.getSource();
      var sValue = oEvent.getParameter("value");
      var sBindingPath = oInput.getBinding("value") && oInput.getBinding("value").getPath();
      if (!sBindingPath) return;
      oModel.setProperty(sBindingPath, sValue);
      var oEditRow = oModel.getProperty("/editRow") || {};
      var qty = parseFloat(oEditRow.totalQuantity) || 0;
      var amount = parseFloat(oEditRow.amountPerUnit) || 0;
      oModel.setProperty("/editRow/total", qty * amount);
    },

    onSaveEdit: function () {
      var oModel = this.getView().getModel();
      var oEditRow = oModel.getProperty("/editRow");
      var qty = parseFloat(oEditRow.totalQuantity) || 0;
      var amount = parseFloat(oEditRow.amountPerUnit) || 0;
      oEditRow.total = qty * amount;

      if (this._editPath) {
        oModel.setProperty(this._editPath, oEditRow);
      }

      var totalValue = (oModel.getProperty("/MainItems") || []).reduce(
        (sum, record) => sum + Number(record.total || 0), 0
      );
      oModel.setProperty("/totalValue", totalValue);
      oModel.refresh(true);

      this._EditItemDialog.close();
      this._EditItemDialog.destroy();
      this._EditItemDialog = null;
      sap.m.MessageToast.show("Item updated successfully!");
    },

    onDeleteItem: function (oEvent) {
      var oBindingContext = oEvent.getSource().getBindingContext();
      if (oBindingContext) {
        var sPath = oBindingContext.getPath();
        var oModel = this.getView().getModel();
        var oItem = oModel.getProperty(sPath);

        sap.m.MessageBox.confirm(
          "Are you sure you want to delete item " + (oItem.executionOrderMainCode || "") + "?",
          {
            title: "Confirm Deletion",
            onClose: function (oAction) {
              if (oAction === sap.m.MessageBox.Action.OK) {
                var aItems = oModel.getProperty("/MainItems");
                var iIndex = parseInt(sPath.split("/")[2]);
                if (iIndex > -1) {
                  aItems.splice(iIndex, 1);
                  oModel.setProperty("/MainItems", aItems);
                  var totalValue = aItems.reduce((sum, record) => sum + Number(record.total || 0), 0);
                  oModel.setProperty("/totalValue", totalValue);
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
      const oModel = this.getView().getModel();
      const MainItems = oModel.getProperty("/MainItems") || [];

      // Recalculate totals before sending
      MainItems.forEach(item => {
        const qty = parseFloat(item.totalQuantity) || 0;
        const amount = parseFloat(item.amountPerUnit) || 0;
        item.total = qty * amount;
      });

      // FIX: resolve currencyCode UUID → actual currency string (e.g. "SAR")
      // The Currency entity uses a UUID as its PK; the real SAP currency code is stored in `code`.
      const aCurrencies = oModel.getProperty("/Currencies") || [];
      const resolveCurrency = (val) => {
        if (!val) return "";
        // If it looks like a UUID, look it up; otherwise assume it's already a code string
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        if (!isUUID) return val;
        const match = aCurrencies.find(c => c.currencyCode === val);
        return match ? match.code : val;
      };

      // FIX 4: Build executionOrders array matching ExecutionOrderMainCommand type in CDS
      // Mirror the Spring Boot controller: list of commands + salesOrder/salesOrderItem/pricing as top-level params
      const executionOrders = MainItems.map(item => ({
        referenceId:               oModel.getProperty("/docNumber") || "",
        salesOrderItem:            oModel.getProperty("/itemNumber") || "",
        serviceNumberCode:         parseInt(item.serviceNumberCode) || 0,
        description:               item.description || "",
        unitOfMeasurementCode:     item.unitOfMeasurementCode || "",
        currencyCode:              resolveCurrency(item.currencyCode),
        materialGroupCode:         item.materialGroupCode || "",
        personnelNumberCode:       item.personnelNumberCode || "",
        lineTypeCode:              item.lineTypeCode || "",
        serviceTypeCode:           item.serviceTypeCode || "",
        externalServiceNumber:     item.externalServiceNumber || "",
        serviceText:               item.serviceText || "",
        lineText:                  item.lineText || "",
        biddersLine:               item.biddersLine ?? false,
        supplementaryLine:         item.supplementaryLine ?? false,
        lotCostOne:                item.lotCostOne ?? false,
        totalQuantity:             parseFloat(item.totalQuantity) || 0,
        remainingQuantity:         parseFloat(item.remainingQuantity) || 0,
        actualQuantity:            parseFloat(item.actualQuantity) || 0,
        actualPercentage:          parseFloat((parseFloat(item.actualPercentage) || 0).toFixed(3)),
        overFulfillmentPercent:    parseFloat(item.overFulfillmentPercent) || 0,
        unlimitedOverFulfillment:  item.unlimitedOverFulfillment ?? false,
        manualPriceEntryAllowed:   item.manualPriceEntryAllowed ?? false,
        amountPerUnit:             parseFloat(item.amountPerUnit) || 0,
        total:                     parseFloat(item.total) || 0
      }));

      // FIX 4 continued: body structure must match the CDS action signature exactly.
      // CAP OData actions receive all params as a flat JSON body.
      const body = {
        executionOrders:          executionOrders,
        salesOrder:               oModel.getProperty("/docNumber") || "",
        salesOrderItem:           oModel.getProperty("/itemNumber") || "",
        pricingProcedureStep:     10,
        pricingProcedureCounter:  1,
        customerNumber:           "120000"
      };

      console.log("Payload sent to API:", JSON.stringify(body, null, 2));

      // FIX: absolute path — remove leading ./ to avoid /execution/ prefix being prepended
      fetch("./odata/v4/sales-cloud/saveOrUpdateExecutionOrders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
        .then(response => {
          if (!response.ok) {
            return response.text().then(t => { throw new Error(t || response.statusText); });
          }
          return response.json();
        })
        .then(result => {
          console.log("Save result:", result);
          // Refresh table with returned data if available
          if (result && result.value && Array.isArray(result.value)) {
            oModel.setProperty("/MainItems", result.value);
            var totalValue = result.value.reduce((sum, r) => sum + Number(r.total || 0), 0);
            oModel.setProperty("/totalValue", totalValue);
            oModel.refresh(true);
          }
          sap.m.MessageToast.show("Document saved successfully!");
        })
        .catch(err => {
          console.error("Error saving document:", err);
          sap.m.MessageBox.error("Save failed: " + err.message);
        });
    },

    onAddMianItem: function () {
      // ── ISSUE 3 FIX ────────────────────────────────────────────────────────
      // Replaces the old plain-Input dialog with a full-featured add dialog
      // that mirrors the Spring Boot "add item" and the import-from-model flow:
      // dropdowns for Service Number, UOM, Currency, Material Group, Service Type
      // so the user always selects descriptions, never types raw codes/UUIDs.
      var that = this;
      var oModel = this.getView().getModel();

      if (!this._AddItemDialog) {
        var oForm = new sap.ui.layout.form.SimpleForm({
          layout: "ResponsiveGridLayout",
          editable: true,
          labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
          adjustLabelSpan: false,
          emptySpanXL: 1, emptySpanL: 1, emptySpanM: 1, emptySpanS: 0,
          columnsXL: 2, columnsL: 2, columnsM: 1,
          content: [
            // ── Service Number (dropdown) ──────────────────────────────────
            new sap.m.Label({ text: "Service No" }),
            new sap.m.Select(this.createId("addExecServiceNo"), {
              forceSelection: false,
              width: "100%",
              items: {
                path: "/ServiceNumbers",
                template: new sap.ui.core.Item({
                  key: "{serviceNumberCode}",
                  text: "{description}"
                })
              },
              change: function (oEvent) {
                var oItem = oEvent.getParameter("selectedItem");
                if (oItem) {
                  that.byId("addExecDescription").setValue(oItem.getText());
                }
              }
            }),

            // ── Description ────────────────────────────────────────────────
            new sap.m.Label({ text: "Description" }),
            new sap.m.Input(this.createId("addExecDescription")),

            // ── Quantity ──────────────────────────────────────────────────
            new sap.m.Label({ text: "QTY" }),
            new sap.m.Input(this.createId("addExecQTY"), {
              type: "Number",
              liveChange: function () {
                var qty = parseFloat(that.byId("addExecQTY").getValue()) || 0;
                var amt = parseFloat(that.byId("addExecAmtPerUnit").getValue()) || 0;
                that.byId("addExecTotal").setValue((qty * amt).toFixed(3));
              }
            }),

            // ── UOM (dropdown) ────────────────────────────────────────────
            new sap.m.Label({ text: "UOM" }),
            new sap.m.Select(this.createId("addExecUOM"), {
              forceSelection: false,
              width: "100%",
              items: {
                path: "/Uom",
                template: new sap.ui.core.Item({
                  key: "{code}",
                  text: "{description}"
                })
              }
            }),

            // ── Amount Per Unit ────────────────────────────────────────────
            new sap.m.Label({ text: "Amount Per Unit" }),
            new sap.m.Input(this.createId("addExecAmtPerUnit"), {
              type: "Number",
              liveChange: function () {
                var qty = parseFloat(that.byId("addExecQTY").getValue()) || 0;
                var amt = parseFloat(that.byId("addExecAmtPerUnit").getValue()) || 0;
                that.byId("addExecTotal").setValue((qty * amt).toFixed(3));
              }
            }),

            // ── Currency (dropdown) ────────────────────────────────────────
            new sap.m.Label({ text: "Currency" }),
            new sap.m.Select(this.createId("addExecCurrency"), {
              forceSelection: false,
              width: "100%",
              items: {
                path: "/Currencies",
                template: new sap.ui.core.Item({
                  key: "{code}",
                  text: "{description}"
                })
              }
            }),

            // ── Total (read-only) ─────────────────────────────────────────
            new sap.m.Label({ text: "Total" }),
            new sap.m.Input(this.createId("addExecTotal"), { editable: false }),

            // ── Over Fulfillment % ─────────────────────────────────────────
            new sap.m.Label({ text: "Over Fulfillment %" }),
            new sap.m.Input(this.createId("addExecOverFulf"), { type: "Number" }),

            // ── Unlimited Over Fulfillment ────────────────────────────────
            new sap.m.Label({ text: "Unlimited Over Fulfillment" }),
            new sap.m.CheckBox(this.createId("addExecUnlimOF")),

            // ── Manual Price Entry Allowed ────────────────────────────────
            new sap.m.Label({ text: "Manual Price Entry Allowed" }),
            new sap.m.CheckBox(this.createId("addExecManualPrice")),

            // ── Material Group (dropdown) ─────────────────────────────────
            new sap.m.Label({ text: "Material Group" }),
            new sap.m.Select(this.createId("addExecMatGroup"), {
              forceSelection: false,
              width: "100%",
              items: {
                path: "/MaterialGroup",
                template: new sap.ui.core.Item({
                  key: "{materialGroupCode}",
                  text: "{description}"
                })
              }
            }),

            // ── Service Type (dropdown) ───────────────────────────────────
            new sap.m.Label({ text: "Service Type" }),
            new sap.m.Select(this.createId("addExecSrvType"), {
              forceSelection: false,
              width: "100%",
              items: {
                path: "/ServiceTypes",
                template: new sap.ui.core.Item({
                  key: "{serviceTypeCode}",
                  text: "{description}"
                })
              }
            }),

            // ── Remaining text / checkbox fields ──────────────────────────
            new sap.m.Label({ text: "External Service Number" }),
            new sap.m.Input(this.createId("addExecExtSrvNo")),

            new sap.m.Label({ text: "Service Text" }),
            new sap.m.Input(this.createId("addExecSrvText")),

            new sap.m.Label({ text: "Line Text" }),
            new sap.m.Input(this.createId("addExecLineText")),

            new sap.m.Label({ text: "Personnel NR" }),
            new sap.m.Input(this.createId("addExecPersoNr")),

            new sap.m.Label({ text: "Line Type" }),
            new sap.m.Input(this.createId("addExecLineType")),

            new sap.m.Label({ text: "Bidders' Line" }),
            new sap.m.CheckBox(this.createId("addExecBiddersLine")),

            new sap.m.Label({ text: "Supplementary Line" }),
            new sap.m.CheckBox(this.createId("addExecSuppLine")),

            new sap.m.Label({ text: "Lot Cost One" }),
            new sap.m.CheckBox(this.createId("addExecLCO"))
          ]
        });

        this._AddItemDialog = new sap.m.Dialog({
          title: "Add New Item",
          contentWidth: "750px",
          contentHeight: "auto",
          resizable: true,
          draggable: true,
          content: [oForm],
          beginButton: new sap.m.Button({
            text: "Add",
            type: "Emphasized",
            press: function () {
              var qty = parseFloat(that.byId("addExecQTY").getValue()) || 0;
              var amt = parseFloat(that.byId("addExecAmtPerUnit").getValue()) || 0;

              // Resolve selected items — store getText() (the description)
              // so it matches the convention used by tendering/model import.
              var oUOMItem      = that.byId("addExecUOM").getSelectedItem();
              var oCurrItem     = that.byId("addExecCurrency").getSelectedItem();
              var oMatGrpItem   = that.byId("addExecMatGroup").getSelectedItem();
              var oSrvTypeItem  = that.byId("addExecSrvType").getSelectedItem();
              var oSrvNoItem    = that.byId("addExecServiceNo").getSelectedItem();

              var newItem = {
                serviceNumberCode:       oSrvNoItem  ? oSrvNoItem.getKey()   : "",
                description:             that.byId("addExecDescription").getValue(),
                totalQuantity:           qty,
                actualQuantity:          0,
                unitOfMeasurementCode:   oUOMItem    ? oUOMItem.getText()    : "",
                amountPerUnit:           amt,
                currencyCode:            oCurrItem   ? oCurrItem.getText()   : "",
                total:                   qty * amt,
                overFulfillmentPercent:  parseFloat(that.byId("addExecOverFulf").getValue()) || 0,
                unlimitedOverFulfillment: that.byId("addExecUnlimOF").getSelected(),
                manualPriceEntryAllowed: that.byId("addExecManualPrice").getSelected(),
                materialGroupCode:       oMatGrpItem ? oMatGrpItem.getText() : "",
                serviceTypeCode:         oSrvTypeItem? oSrvTypeItem.getText(): "",
                externalServiceNumber:   that.byId("addExecExtSrvNo").getValue(),
                serviceText:             that.byId("addExecSrvText").getValue(),
                lineText:                that.byId("addExecLineText").getValue(),
                personnelNumberCode:     that.byId("addExecPersoNr").getValue(),
                lineTypeCode:            that.byId("addExecLineType").getValue(),
                biddersLine:             that.byId("addExecBiddersLine").getSelected(),
                supplementaryLine:       that.byId("addExecSuppLine").getSelected(),
                lotCostOne:              that.byId("addExecLCO").getSelected()
              };

              var oMainModel = that.getView().getModel();
              var aItems = oMainModel.getProperty("/MainItems") || [];
              aItems.push(newItem);
              oMainModel.setProperty("/MainItems", aItems);

              var totalValue = aItems.reduce((sum, r) => sum + Number(r.total || 0), 0);
              oMainModel.setProperty("/totalValue", totalValue);
              oMainModel.refresh(true);

              sap.m.MessageToast.show("New line added successfully!");

              that._AddItemDialog.close();
              that._AddItemDialog.destroy();
              that._AddItemDialog = null;
            }
          }),
          endButton: new sap.m.Button({
            text: "Cancel",
            press: function () {
              that._AddItemDialog.close();
              that._AddItemDialog.destroy();
              that._AddItemDialog = null;
            }
          })
        });

        this.getView().addDependent(this._AddItemDialog);
      }

      // Set the model on the dialog so dropdown paths resolve correctly
      this._AddItemDialog.setModel(oModel);
      this._AddItemDialog.open();
    }
  });
});