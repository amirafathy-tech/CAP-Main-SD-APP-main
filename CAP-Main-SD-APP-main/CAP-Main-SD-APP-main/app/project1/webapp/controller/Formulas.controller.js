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
            fetch("/odata/v4/sales-cloud/Formulas")
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
            fetch("/odata/v4/sales-cloud/Formulas")
                .then(response => response.json())
                .then(data => {
                    oModel.setData({ Formulas: data.value });
                    this.getView().byId("formulasTable").setModel(oModel);
                })
                .catch(err => {
                    console.error("Error fetching formulas", err);
                });
        },

        onNavigateToAddFormula: function () {
            this.getOwnerComponent().getRouter().navTo("formula");
        },

        // ─── DETAILS ──────────────────────────────────────────────────────────
        onDetails: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (!oBindingContext) return;
            var oData = oBindingContext.getObject();
            var oDialogModel = new sap.ui.model.json.JSONModel({
                FormulaCode:       oData.formula,
                Description:       oData.description,
                NumberOfParameters: oData.numberOfParameters,
                Relation:          oData.formulaLogic
            });
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
                        press: function () { this._oDetailsDialog.close(); }.bind(this)
                    })
                });
                this.getView().addDependent(this._oDetailsDialog);
            }
            this._oDetailsDialog.setModel(oDialogModel);
            this._oDetailsDialog.open();
        },

        // ─── EDIT ─────────────────────────────────────────────────────────────
        onEdit: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (!oBindingContext) return;
            var oData = oBindingContext.getObject();

            // Build an edit model pre-filled with the current formula values
            var oEditModel = new sap.ui.model.json.JSONModel({
                formulaCode:        oData.formulaCode,
                formula:            oData.formula,
                description:        oData.description,
                numberOfParameters: oData.numberOfParameters,
                formulaLogic:       oData.formulaLogic || "",
                parameterIds:       (oData.parameterIds || []).join(", "),
                parameterDescriptions: (oData.parameterDescriptions || []).join(", ")
            });

            // Build dialog only once, then reuse with fresh model each time
            if (this._oEditDialog) {
                this._oEditDialog.destroy();
                this._oEditDialog = null;
            }

            this._oEditDialog = new sap.m.Dialog({
                title: "Edit Formula",
                contentWidth: "500px",
                resizable: true,
                content: [
                    new sap.ui.layout.form.SimpleForm({
                        editable: true,
                        layout: "ResponsiveGridLayout",
                        labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                        columnsL: 1, columnsM: 1,
                        content: [
                            new sap.m.Label({ text: "Formula Name *", required: true }),
                            new sap.m.Input({ value: "{edit>/formula}", placeholder: "Formula name" }),

                            new sap.m.Label({ text: "Description *", required: true }),
                            new sap.m.TextArea({ value: "{edit>/description}", placeholder: "Description", rows: 3, width: "100%" }),

                            new sap.m.Label({ text: "Number of Parameters" }),
                            new sap.m.Input({ value: "{edit>/numberOfParameters}", type: "Number", placeholder: "e.g. 2" }),

                            new sap.m.Label({ text: "Parameter IDs (comma-separated)" }),
                            new sap.m.Input({ value: "{edit>/parameterIds}", placeholder: "e.g. P1, P2" }),

                            new sap.m.Label({ text: "Parameter Descriptions (comma-separated)" }),
                            new sap.m.Input({ value: "{edit>/parameterDescriptions}", placeholder: "e.g. Length, Width" }),

                            new sap.m.Label({ text: "Formula Logic / Relation" }),
                            new sap.m.TextArea({ value: "{edit>/formulaLogic}", placeholder: "e.g. P1 * P2", rows: 3, width: "100%" })
                        ]
                    })
                ],
                beginButton: new sap.m.Button({
                    text: "Save",
                    type: "Emphasized",
                    press: this._onEditSave.bind(this)
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: function () { this._oEditDialog.close(); }.bind(this)
                })
            });

            this._oEditDialog.setModel(oEditModel, "edit");
            this.getView().addDependent(this._oEditDialog);
            this._oEditDialog.open();
        },

        _onEditSave: function () {
            var oEditModel = this._oEditDialog.getModel("edit");
            var oData      = oEditModel.getData();

            if (!oData.formula || !oData.description) {
                sap.m.MessageToast.show("Formula name and description are required.");
                return;
            }

            // Convert comma-separated strings back to arrays
            var parameterIds = oData.parameterIds
                ? oData.parameterIds.split(",").map(s => s.trim()).filter(Boolean)
                : [];
            var parameterDescriptions = oData.parameterDescriptions
                ? oData.parameterDescriptions.split(",").map(s => s.trim()).filter(Boolean)
                : [];

            var oPayload = {
                formula:               oData.formula,
                description:           oData.description,
                numberOfParameters:    parseInt(oData.numberOfParameters) || parameterIds.length,
                parameterIds:          parameterIds,
                parameterDescriptions: parameterDescriptions,
                formulaLogic:          oData.formulaLogic || "",
                expression:            oData.formulaLogic || ""
            };

            fetch("/odata/v4/sales-cloud/Formulas('" + oData.formulaCode + "')", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oPayload)
            })
                .then(response => {
                    if (!response.ok) throw new Error("Update failed: " + response.statusText);
                    // 204 No Content on success — no body to parse
                    sap.m.MessageToast.show("Formula updated successfully!");
                    this._oEditDialog.close();
                    this._loadFormulas();   // refresh the list
                })
                .catch(err => {
                    console.error("Error updating Formula:", err);
                    sap.m.MessageBox.error("Error: " + err.message);
                });
        },

        // ─── DELETE ───────────────────────────────────────────────────────────
        onDelete: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (oBindingContext) {
                var sPath  = oBindingContext.getPath();
                var oModel = this.getView().byId("formulasTable").getModel();
                var oItem  = oModel.getProperty(sPath);
                if (!oItem) {
                    sap.m.MessageBox.error("Could not find model data for deletion.");
                    return;
                }

                MessageBox.confirm("Are you sure you want to delete " + oItem.formula + "?", {
                    title: "Confirm Deletion",
                    onClose: function (oAction) {
                        if (oAction === MessageBox.Action.OK) {
                            fetch("/odata/v4/sales-cloud/Formulas('" + oItem.formulaCode + "')", {
                                method: "DELETE"
                            })
                                .then(response => {
                                    if (!response.ok) throw new Error("Failed to delete: " + response.statusText);
                                    var aRecords = oModel.getProperty("/Formulas");
                                    var iIndex   = aRecords.findIndex(st => st.formulaCode === oItem.formulaCode);
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