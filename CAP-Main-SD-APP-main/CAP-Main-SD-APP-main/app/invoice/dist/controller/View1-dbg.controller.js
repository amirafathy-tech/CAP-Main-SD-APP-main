sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    return Controller.extend("invoice.controller.View1", {
        onInit: function () {
            var oModel = new sap.ui.model.json.JSONModel({
                DocumentNumber: "",
                SelectedItemNumber: "",
                ErrorMessage: "",
                documentItems: []
            });
            this.getView().setModel(oModel);
            
            console.log("Invoice Controller initialized - Version 4.0");
        },

        onValueHelpRequest: function(oEvent) {
            console.log("🔍 Debit Memo Dialog opening...");
            
            if (this._oValueHelpDialog) {
                this._oValueHelpDialog.destroy();
                this._oValueHelpDialog = null;
            }

            // Create JSON model for dialog data
            this._dialogModel = new JSONModel({
                debitMemos: [],
                filteredDebitMemos: []
            });

            var oSearchField = new sap.m.SearchField({
                width: "100%",
                placeholder: "Search by debit memo number...",
                liveChange: this.onSearchDebitMemos.bind(this)
            });

            var oTable = new sap.m.Table({
                mode: "SingleSelectMaster",
                growing: true,
                growingThreshold: 50,
                columns: [
                    new sap.m.Column({ header: new sap.m.Label({ text: "Debit Memo Number" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "OverallOrdReltdBillgStatus" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "DebitMemoRequestType" }) }),
                    new sap.m.Column({ header: new sap.m.Label({ text: "SoldToParty" }) })
                ],
                items: {
                    path: "dialog>/filteredDebitMemos",
                    template: new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{dialog>DebitMemoRequest}" }),
                            new sap.m.Text({ text: "{dialog>OverallOrdReltdBillgStatus}" }),
                            new sap.m.Text({ text: "{dialog>DebitMemoRequestType}" }),
                            new sap.m.Text({ text: "{dialog>SoldToParty}" })
                        ]
                    })
                }
            });

            this._oValueHelpDialog = new sap.m.Dialog({
                title: "Select Debit Memo Number",
                contentWidth: "80%",
                contentHeight: "70%",
                content: [oSearchField, oTable],
                beginButton: new sap.m.Button({
                    text: "Confirm",
                    press: () => {
                        const oSelectedItem = oTable.getSelectedItem();
                        if (oSelectedItem) {
                            const oContext = oSelectedItem.getBindingContext("dialog");
                            const sDebitMemo = oContext.getProperty("DebitMemoRequest");
                            
                            this.byId("debitmemoInput").setValue(sDebitMemo);
                            this.getView().getModel().setProperty("/DocumentNumber", sDebitMemo);

                            console.log("✅ Selected debit memo:", sDebitMemo);

                            fetch(`./odata/v4/sales-cloud/findItemsByDebitMemoRequest?debitMemoRequest'${sDebitMemo}'`, {
                                method: "GET",
                                headers: { "Content-Type": "application/json" }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    const parsedValue = JSON.parse(data.value);
                                    if (parsedValue && parsedValue.d && parsedValue.d.results) {
                                        const documentItems = parsedValue.d.results.map(item => ({
                                            DebitMemoRequestItem: item.DebitMemoRequestItem,
                                            DebitMemoRequestItemText: item.DebitMemoRequestItemText
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
            var oBinding = oODataModel.bindList("/DebitMemo");
            
            oBinding.requestContexts(0, 1000).then((aContexts) => {
                const aDebitMemos = aContexts.map(oContext => oContext.getObject());
                this._dialogModel.setProperty("/debitMemos", aDebitMemos);
                this._dialogModel.setProperty("/filteredDebitMemos", aDebitMemos);
                console.log("📊 Loaded debit memos:", aDebitMemos.length);
            });

            this._oValueHelpDialog.open();
        },

        onSearchDebitMemos: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue") || "";
            
            console.log("🔎 Search:", sQuery);
            
            if (!this._dialogModel) return;

            const aAllMemos = this._dialogModel.getProperty("/debitMemos");
            
            if (!sQuery) {
                this._dialogModel.setProperty("/filteredDebitMemos", aAllMemos);
                console.log("✅ Showing all", aAllMemos.length, "debit memos");
                return;
            }

            const aFiltered = aAllMemos.filter(item => {
                const memoNum = String(item.DebitMemoRequest || "");
                return memoNum.includes(sQuery);
            });

            this._dialogModel.setProperty("/filteredDebitMemos", aFiltered);
            console.log(`✅ Found ${aFiltered.length} debit memos matching "${sQuery}"`);
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
            oRouter.navTo("invoice", {
                docNumber: docNumber,
                itemNumber: itemNumber
            });
        }
    });
});