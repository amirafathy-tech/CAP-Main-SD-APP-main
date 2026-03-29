sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/ui/model/json/JSONModel"
], function (Controller, MessageBox, Dialog, Input, Button, Label, VBox, JSONModel) {
    "use strict";
    return Controller.extend("project1.controller.Model", {
        onInit: function () {



            this.getOwnerComponent().getRouter()
                .getRoute("model")
                .attachPatternMatched(this._onRouteMatched, this);

            var oModel = new sap.ui.model.json.JSONModel({
                Models: [],
            });
            this.getView().setModel(oModel, "view");
            //  // optional: refresh table if you show models
            //         let oTable = this.getView().byId("modelTable")
            //         //this.byId("modelTable");
            //         oTable.getBinding("items").refresh();


            // currency
            fetch("./odata/v4/sales-cloud/Currencies")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    this.getView().setModel(oModel, "currencies");
                });
            // Fetch data from CAP OData service

            fetch("./odata/v4/sales-cloud/ModelSpecifications")
                .then(response => response.json())
                .then(data => {
                    oModel.setData({ Models: data.value });
                    this.getView().byId("modelTable").setModel(oModel);
                })
                .catch(err => {
                    console.error("Error fetching models", err);
                });
        },
        _onRouteMatched: function () {
            this._loadModels();
        },
        _loadModels: function () {
            var oView = this.getView();
            // ── ISSUE 2 FIX ─────────────────────────────────────────────────────────
            // ModelSpecifications stores currencyCode as a UUID (the entity PK).
            // The view binds to {currencyDescription}, so we fetch both currencies and
            // models together and cross-reference to build the description field.
            Promise.all([
                fetch("./odata/v4/sales-cloud/Currencies").then(r => r.json()),
                fetch("./odata/v4/sales-cloud/ModelSpecifications").then(r => r.json())
            ])
            .then(([currencyData, modelData]) => {
                var aCurrencies = Array.isArray(currencyData.value) ? currencyData.value : [];
                var aModels = Array.isArray(modelData.value) ? modelData.value : [];

                // Enrich each model with a human-readable currencyDescription
                var aEnriched = aModels.map(function (m) {
                    var oCur = aCurrencies.find(function (c) {
                        return c.currencyCode === m.currencyCode;
                    });
                    return Object.assign({}, m, {
                        currencyDescription: oCur ? (oCur.code || oCur.description) : (m.currencyCode || "")
                    });
                });

                console.log("Models", aEnriched);
                var oModel = new sap.ui.model.json.JSONModel({ Models: aEnriched });
                oView.byId("modelTable").setModel(oModel);
            })
            .catch(err => {
                console.error("Error fetching models", err);
            });
        },
        onEdit: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getParent().getParent().getBindingContext();


            if (!oContext) {
                MessageBox.warning("Error: Unable to retrieve row data");
                return;
            }
            var oSelectedData = oContext.getObject();
            var oModel = this.getView().getModel("view");
            if (!this._oEditDialog) {

                this._oModelServSpecInput = new Input();
                this._oBlockingIndicatorInput = new sap.m.CheckBox();
                this._oServiceSelectionInput = new sap.m.CheckBox();
                this._oDescriptionInput = new Input();
                this._oSearchTermInput = new Input();
                this._oCurrencyCodeSelect = new sap.m.Select({
                    id: "currency",
                    class: "sapUiSmallMarginStart",
                    width: "200px",
                    forceSelection: false,
                    items: {
                        path: "currencies>/",
                        template:
                            new sap.ui.core.Item({
                                key: "{currencies>currencyCode}",
                                text: "{currencies>description}"
                            })
                    }
                });
                this._oCurrencyCodeSelect.insertItem(
                    new sap.ui.core.Item({ key: "", text: "Cancel" }),
                    0
                );
                this._oEditDialog = new Dialog({
                    title: "Edit Model",
                    titleAlignment: "Center",
                    contentWidth: "600px",
                    content: new sap.ui.layout.form.SimpleForm({
                        editable: true,
                        layout: "ResponsiveGridLayout",
                        content: [
                            new Label({ text: "modelServSpec", design: "Bold" }),
                            this._oModelServSpecInput,

                            new Label({ text: "blockingIndicator", design: "Bold" }),
                            this._oBlockingIndicatorInput,

                            new Label({ text: "serviceSelection", design: "Bold" }),
                            this._oServiceSelectionInput,

                            new Label({ text: "description", design: "Bold" }),
                            this._oDescriptionInput,

                            new Label({ text: "searchTerm", design: "Bold" }),
                            this._oSearchTermInput,

                            new Label({ text: "currencyCode", design: "Bold" }),
                            this._oCurrencyCodeSelect
                        ]
                    }),
                    beginButton: new Button({
                        text: "Save",
                        type: "Emphasized",
                        press: () => {
                            const updatedData = {
                                modelServSpec: this._oModelServSpecInput.getValue(),
                                blockingIndicator: this._oBlockingIndicatorInput.getSelected(),
                                serviceSelection: this._oServiceSelectionInput.getSelected(),
                                description: this._oDescriptionInput.getValue(),
                                searchTerm: this._oSearchTermInput.getValue(),
                                currencyCode: this._oCurrencyCodeSelect.getSelectedKey()
                            };

                            fetch(`./odata/v4/sales-cloud/ModelSpecifications('${(oSelectedData.modelSpecCode)}')`, {
                                method: "PATCH",
                                headers: {
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify(updatedData)
                            })
                                .then(res => {
                                    if (!res.ok) throw new Error("Update failed");
                                    return res.json();
                                })
                                .then((updatedItem) => {
                                    console.log(updatedItem);
                                    // Reload the full list so currency description is re-enriched
                                    this._loadModels();
                                    sap.m.MessageToast.show("Model updated successfully");
                                    this._oEditDialog.close();
                                })
                                .catch(err => {
                                    sap.m.MessageBox.error("Error updating model: " + err.message);
                                });
                        }
                    }),

                    endButton: new Button({
                        text: "Cancel",
                        press: () => this._oEditDialog.close()
                    })
                });
                this.getView().addDependent(this._oEditDialog);
            }
            this._oModelServSpecInput.setValue(oSelectedData.modelServSpec);
            this._oBlockingIndicatorInput.setSelected(!!oSelectedData.blockingIndicator);
            this._oServiceSelectionInput.setSelected(!!oSelectedData.serviceSelection);

            // this._oBlockingIndicatorInput.setValue(oSelectedData.blockingIndicator);
            // this._oServiceSelectionInput.setValue(oSelectedData.serviceSelection);
            this._oDescriptionInput.setValue(oSelectedData.description);
            this._oSearchTermInput.setValue(oSelectedData.searchTerm);
            this._oCurrencyCodeSelect.setValue(oSelectedData.currencyCode);

            this._oEditDialog.open();
        },
        onDelete: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (oBindingContext) {
                var sPath = oBindingContext.getPath();
                // var oModel = this.getView().getModel("view");
                var oModel = this.getView().byId("modelTable").getModel();
                var oItem = oModel.getProperty(sPath);
                if (!oItem) {
                    sap.m.MessageBox.error("Could not find model data for deletion.");
                    return;
                }

                MessageBox.confirm("Are you sure you want to delete " + oItem.modelServSpec + "?", {
                    title: "Confirm Deletion",
                    onClose: function (oAction) {
                        if (oAction === MessageBox.Action.OK) {
                            // 🔥 Call CAP backend DELETE
                            fetch(`./odata/v4/sales-cloud/ModelSpecifications('${oItem.modelSpecCode}')`, {
                                method: "DELETE"
                            })
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error("Failed to delete: " + response.statusText);
                                    }

                                    //  Update local JSONModel
                                    var aRecords = oModel.getProperty("/Models");
                                    var iIndex = aRecords.findIndex(st => st.modelSpecCode === oItem.modelSpecCode);
                                    if (iIndex > -1) {
                                        aRecords.splice(iIndex, 1);
                                        oModel.setProperty("/Models", aRecords);
                                    }

                                    sap.m.MessageToast.show("Model deleted successfully!");
                                })
                                .catch(err => {
                                    console.error("Error deleting Model:", err);
                                    sap.m.MessageBox.error("Error: " + err.message);
                                });
                        }
                    }
                });
            }
        },
        onPress() {
            this.getOwnerComponent().getRouter().navTo("addModel");
        },
        onNavigateToModelServices: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const oData = oContext.getObject();
            const sModelSpecCode = oData.modelSpecCode;
            console.log("Nav to Service", oData);
            this.getOwnerComponent().getRouter().navTo("modelServices", {
                modelSpecCode: sModelSpecCode,
                Record: oData
            });
        }
    });
});