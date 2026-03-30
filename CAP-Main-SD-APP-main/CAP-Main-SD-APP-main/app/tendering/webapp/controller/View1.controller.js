sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    return Controller.extend("tendering.controller.View1", {
        onInit: function () {
            var oModel = new sap.ui.model.json.JSONModel({
                DocumentNumber: "",
                SelectedItemNumber: "",
                ErrorMessage: "",
                documentItems: []
            });
            this.getView().setModel(oModel);
            
            console.log("View1 Controller initialized - Version 5.0");
        },

        onValueHelpRequest: function(oEvent) {
            console.log("🔍 Dialog opening...");
            
            if (this._oValueHelpDialog) {
                this._oValueHelpDialog.destroy();
                this._oValueHelpDialog = null;
            }

            // Create JSON model for dialog data
            this._dialogModel = new JSONModel({
                quotations: [],
                filteredQuotations: []
            });

            var oSearchField = new sap.m.SearchField({
                width: "100%",
                placeholder: "Search by quotation number...",
                liveChange: this.onSearchQuotations.bind(this)
            });

            var oTable = new sap.m.Table({
                mode: "SingleSelectMaster",
                growing: true,
                growingThreshold: 50,
                columns: [
                    new sap.m.Column({ header: new sap.m.Label({ text: "Quotation Number" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "OverallSDProcessStatus" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "CustomerPaymentTerms" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "SoldToParty" }) })
                ],
                items: {
                    path: "dialog>/filteredQuotations",
                    template: new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{dialog>SalesQuotation}" }),
                            new sap.m.Text({ text: "{dialog>OverallSDProcessStatus}" }),
                            new sap.m.Text({ text: "{dialog>CustomerPaymentTerms}" }),
                            new sap.m.Text({ text: "{dialog>SoldToParty}" })
                        ]
                    })
                }
            });

            this._oValueHelpDialog = new sap.m.Dialog({
                title: "Select Quotation Number",
                contentWidth: "80%",
                contentHeight: "70%",
                content: [oSearchField, oTable],
                beginButton: new sap.m.Button({
                    text: "Confirm",
                    press: () => {
                        const oSelectedItem = oTable.getSelectedItem();
                        if (oSelectedItem) {
                            const oContext = oSelectedItem.getBindingContext("dialog");
                            const sQuotation = oContext.getProperty("SalesQuotation");
                            
                            this.byId("quotationInput").setValue(sQuotation);
                            this.getView().getModel().setProperty("/DocumentNumber", sQuotation);

                            console.log("✅ Selected quotation:", sQuotation);

                            fetch(`./odata/v4/sales-cloud/SalesQuotation('${sQuotation}')/items`, {
                                method: "GET",
                                headers: { "Content-Type": "application/json" }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    if (data && data.value) {
                                        const documentItems = data.value.map(item => ({
                                            SalesQuotationItem: item.SalesQuotationItem,
                                            SalesQuotationItemText: item.SalesQuotationItemText
                                        }));
                                        this.getView().getModel().setProperty("/documentItems", documentItems);
                                        console.log("✅ Stored documentItems:", documentItems);
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
            var oBinding = oODataModel.bindList("/SalesQuotation");
            
            oBinding.requestContexts(0, 1000).then((aContexts) => {
                const aQuotations = aContexts.map(oContext => oContext.getObject());
                this._dialogModel.setProperty("/quotations", aQuotations);
                this._dialogModel.setProperty("/filteredQuotations", aQuotations);
                console.log("📊 Loaded quotations:", aQuotations.length);
            });

            this._oValueHelpDialog.open();
        },

        onSearchQuotations: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue") || "";
            
            console.log("🔎 Search:", sQuery);
            
            if (!this._dialogModel) return;

            const aAllQuotations = this._dialogModel.getProperty("/quotations");
            
            if (!sQuery) {
                this._dialogModel.setProperty("/filteredQuotations", aAllQuotations);
                console.log("✅ Showing all", aAllQuotations.length, "quotations");
                return;
            }

            const aFiltered = aAllQuotations.filter(item => {
                const quotationNum = String(item.SalesQuotation || "");
                return quotationNum.includes(sQuery);
            });

            this._dialogModel.setProperty("/filteredQuotations", aFiltered);
            console.log(`✅ Found ${aFiltered.length} quotations matching "${sQuery}"`);
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
            oRouter.navTo("tendering", {
                docNumber: docNumber,
                itemNumber: itemNumber
            });
        }
    });
});