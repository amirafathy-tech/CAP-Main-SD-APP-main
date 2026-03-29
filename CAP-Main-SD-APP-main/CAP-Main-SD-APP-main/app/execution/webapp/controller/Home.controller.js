sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    return Controller.extend("execution.controller.Home", {
        onInit: function () {
            var oModel = new sap.ui.model.json.JSONModel({
                DocumentNumber: "",
                SelectedItemNumber: "",
                ErrorMessage: "",
                documentItems: []
            });
            this.getView().setModel(oModel);
            
            console.log("Execution Controller initialized - Version 4.0");
        },

        onValueHelpRequest: function(oEvent) {
            console.log("🔍 Sales Order Dialog opening...");
            
            if (this._oValueHelpDialog) {
                this._oValueHelpDialog.destroy();
                this._oValueHelpDialog = null;
            }

            // Create JSON model for dialog data
            this._dialogModel = new JSONModel({
                salesOrders: [],
                filteredSalesOrders: []
            });

            var oSearchField = new sap.m.SearchField({
                width: "100%",
                placeholder: "Search by sales order number...",
                liveChange: this.onSearchSalesOrders.bind(this)
            });

            var oTable = new sap.m.Table({
                mode: "SingleSelectMaster",
                growing: true,
                growingThreshold: 50,
                columns: [
                    new sap.m.Column({ header: new sap.m.Label({ text: "Sales Order Number" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "OverallSDProcessStatus" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "CustomerPaymentTerms" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "SoldToParty" }) })
                ],
                items: {
                    path: "dialog>/filteredSalesOrders",
                    template: new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{dialog>SalesOrder}" }),
                            new sap.m.Text({ text: "{dialog>OverallSDProcessStatus}" }),
                            new sap.m.Text({ text: "{dialog>CustomerPaymentTerms}" }),
                            new sap.m.Text({ text: "{dialog>SoldToParty}" })
                        ]
                    })
                }
            });

            this._oValueHelpDialog = new sap.m.Dialog({
                title: "Select Sales Order Number",
                contentWidth: "80%",
                contentHeight: "70%",
                content: [oSearchField, oTable],
                beginButton: new sap.m.Button({
                    text: "Confirm",
                    press: () => {
                        const oSelectedItem = oTable.getSelectedItem();
                        if (oSelectedItem) {
                            const oContext = oSelectedItem.getBindingContext("dialog");
                            const sOrder = oContext.getProperty("SalesOrder");
                            
                            this.byId("salesorderInput").setValue(sOrder);
                            this.getView().getModel().setProperty("/DocumentNumber", sOrder);

                            console.log("✅ Selected sales order:", sOrder);

                            fetch(`/odata/v4/sales-cloud/findItemsBySalesOrder?salesOrder'${sOrder}'`, {
                                method: "GET",
                                headers: { "Content-Type": "application/json" }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    const parsedValue = JSON.parse(data.value);
                                    if (parsedValue && parsedValue.d && parsedValue.d.results) {
                                        const documentItems = parsedValue.d.results.map(item => ({
                                            SalesOrderItem: item.SalesOrderItem,
                                            SalesOrderItemText: item.SalesOrderItemText
                                        }));
                                        this.getView().getModel().setProperty("/documentItems", documentItems);
                                        console.log("✅ Stored items:", documentItems);
                                    } else {
                                        MessageBox.warning("No items found.");
                                    }
                                })
                                .catch(err => {
                                    console.error("❌ Error:", err);
                                    MessageBox.error("Error: " + err.message);
                                });

                            this._oValueHelpDialog.close();
                        }
                    }
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: () => this._oValueHelpDialog.close()
                }),
                afterClose: () => {
                    this._oValueHelpDialog.destroy();
                    this._oValueHelpDialog = null;
                    this._dialogModel = null;
                }
            });

            this._oValueHelpDialog.setModel(this._dialogModel, "dialog");
            this.getView().addDependent(this._oValueHelpDialog);
            
            // Load data from OData
            var oODataModel = this.getOwnerComponent().getModel();
            var oBinding = oODataModel.bindList("/SalesOrders");
            
            oBinding.requestContexts(0, 1000).then((aContexts) => {
                const aSalesOrders = aContexts.map(oContext => oContext.getObject());
                this._dialogModel.setProperty("/salesOrders", aSalesOrders);
                this._dialogModel.setProperty("/filteredSalesOrders", aSalesOrders);
                console.log("📊 Loaded sales orders:", aSalesOrders.length);
            });

            this._oValueHelpDialog.open();
        },

        onSearchSalesOrders: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue") || "";
            
            console.log("🔎 Search:", sQuery);
            
            if (!this._dialogModel) return;

            const aAllOrders = this._dialogModel.getProperty("/salesOrders");
            
            if (!sQuery) {
                this._dialogModel.setProperty("/filteredSalesOrders", aAllOrders);
                console.log("✅ Showing all", aAllOrders.length, "sales orders");
                return;
            }

            const aFiltered = aAllOrders.filter(item => {
                const orderNum = String(item.SalesOrder || "");
                return orderNum.includes(sQuery);
            });

            this._dialogModel.setProperty("/filteredSalesOrders", aFiltered);
            console.log(`✅ Found ${aFiltered.length} sales orders matching "${sQuery}"`);
        },

        onNextPress: function () {
            const oView = this.getView();
            const oModel = oView.getModel();

            const itemNumber = oView.byId("_IDGenSelect").getSelectedKey();
            const docNumber = oModel.getProperty("/DocumentNumber");

            if (!docNumber) {
                MessageBox.warning("Document Number is required.");
                return;
            }

            if (!itemNumber) {
                MessageBox.warning("Item Number is required.");
                return;
            }

            MessageToast.show("Navigating with Doc: " + docNumber + ", Item: " + itemNumber);

            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.navTo("ExecutionOrder", {
                docNumber: docNumber,
                itemNumber: itemNumber
            });
        }
    });
});