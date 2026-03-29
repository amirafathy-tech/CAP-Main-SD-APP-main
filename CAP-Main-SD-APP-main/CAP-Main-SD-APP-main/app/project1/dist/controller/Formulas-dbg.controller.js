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

    return Controller.extend("project1.controller.Formulas", {
        onInit: function () {

              this.getOwnerComponent().getRouter()
                .getRoute("formulas")  
                .attachPatternMatched(this._onRouteMatched, this);

            var oModel = new sap.ui.model.json.JSONModel({
                Formulas: [],
            });
            this.getView().setModel(oModel, "view");

            // Fetch data from CAP OData service
            var oModel = new JSONModel();
            fetch("./odata/v4/sales-cloud/Formulas")
                .then(response => response.json())
                .then(data => {

                    // Wrap array inside an object for binding
                    oModel.setData({ Formulas: data.value });
                    this.getView().byId("formulasTable").setModel(oModel);
                })
                .catch(err => {
                    console.error("Error fetching formulas", err);
                });

        },


        _onRouteMatched: function () {
            this._loadFormulas();
        },
        _loadFormulas: function () {
            var oModel = new sap.ui.model.json.JSONModel();
            fetch("./odata/v4/sales-cloud/Formulas")
                .then(response => response.json())
                .then(data => {
                    oModel.setData({ Formulas: data.value });
                    this.getView().byId("formulasTable").setModel(oModel);
                })
                .catch(err => {
                    console.error("Error fetching formulas", err);
                });
        },

        onNavigateToAddFormula() {
            this.getOwnerComponent().getRouter().navTo("formula");
        },
        onDetails: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (!oBindingContext) {
                return;
            }
            // Get selected row data
            var oData = oBindingContext.getObject();
            var oDialogModel = new sap.ui.model.json.JSONModel({
                FormulaCode: oData.formula,
                Description: oData.description,
                NumberOfParameters: oData.numberOfParameters,
                Relation: oData.formulaLogic
            });
            // Create dialog if not exists
            if (!this._oDetailsDialog) {
                this._oDetailsDialog = new sap.m.Dialog({
                    title: "Formula Details",
                    content: new sap.ui.layout.form.SimpleForm({
                        editable: false,
                        content: [
                            new sap.m.Label({ text: "Formula Code:" }),
                            new sap.m.Text({ text: "{/FormulaCode}" }),

                            new sap.m.Label({ text: "Description:" }),
                            new sap.m.Text({ text: "{/Description}" }),

                            new sap.m.Label({ text: "NumberOfParameters:" }),
                            new sap.m.Text({ text: "{/NumberOfParameters}" }),

                            new sap.m.Label({ text: "Relation:" }),
                            new sap.m.Text({ text: "{/Relation}" })
                        ]
                    }),
                    endButton: new sap.m.Button({
                        text: "Ok",
                        type: "Emphasized",
                        press: function () {
                            this._oDetailsDialog.close();
                        }.bind(this)
                    })
                });

                this.getView().addDependent(this._oDetailsDialog);
            }
            this._oDetailsDialog.setModel(oDialogModel);
            this._oDetailsDialog.open();
        },

        onDelete: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (oBindingContext) {
                var sPath = oBindingContext.getPath();
                // var oModel = this.getView().getModel("view");
                var oModel = this.getView().byId("formulasTable").getModel();
                var oItem = oModel.getProperty(sPath);
                if (!oItem) {
                    sap.m.MessageBox.error("Could not find model data for deletion.");
                    return;
                }

                MessageBox.confirm("Are you sure you want to delete " + oItem.formula + "?", {
                    title: "Confirm Deletion",
                    onClose: function (oAction) {
                        if (oAction === MessageBox.Action.OK) {
                            // 🔥 Call CAP backend DELETE
                            fetch(`./odata/v4/sales-cloud/Formulas('${oItem.formulaCode}')`, {
                                method: "DELETE"
                            })
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error("Failed to delete: " + response.statusText);
                                    }

                                    //  Update local JSONModel
                                    var aRecords = oModel.getProperty("/Formulas");
                                    var iIndex = aRecords.findIndex(st => st.formulaCode === oItem.formulaCode);
                                    if (iIndex > -1) {
                                        aRecords.splice(iIndex, 1);
                                        oModel.setProperty("/Formulas", aRecords);
                                    }

                                    sap.m.MessageToast.show("Formula deleted successfully!");
                                })
                                .catch(err => {
                                    console.error("Error deleting Formula:", err);
                                    sap.m.MessageBox.error("Error: " + err.message);
                                });
                        }
                    }
                });
            }
        },

    });
});