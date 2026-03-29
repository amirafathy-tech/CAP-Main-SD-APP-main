sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/VBox"
], function (Controller, MessageToast, Input, Label, VBox) {
    "use strict";

    return Controller.extend("project1.controller.Formula", {
        onInit: function () {
            var oModel = new sap.ui.model.json.JSONModel({
                paramCount: 0,
                params: [],
                paramIdsText: "",
                relationText: "",
                formulaReview: "",
                testValues: [],
                operations: [
                    { key: "+", text: "+" },
                    { key: "-", text: "-" },
                    { key: "*", text: "*" },
                    { key: "/", text: "/" },
                    { key: "^", text: "^" },
                    { key: "%", text: "%" },
                    { key: "π", text: "π" },
                ],
                wizard: { currentStep: "step1" },

            });
            this.getView().setModel(oModel);
            this.byId("step3").attachActivate(this.updateParamIdsText, this);
            oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
        },

        onAddOperation: function (oEvent) {
            var oTextArea = this.getView().byId("relationInput");
            var operation = oEvent.getSource().getText();
            var currentValue = oTextArea.getValue();
            oTextArea.setValue(currentValue + " " + operation + " ");
        },
        // onParamCountChange: function (oEvent) {
        //     var oModel = this.getView().getModel();
        //     var paramCount = parseInt(oEvent.getParameter("value")) || 0;
        //     oModel.setProperty("/paramCount", paramCount);

        //     var oParamContainer = this.getView().byId("_IDGenVBox8");
        //     oParamContainer.removeAllItems();

        //     for (var i = 1; i <= paramCount; i++) {
        //         var oVBox = new VBox({
        //             items: [
        //                 new Label({ text: "ParamID " + i + "*" }),
        //                 new Input({ value: "{/params/" + (i - 1) + "/id}", placeholder: "Enter ParamID " + i }),
        //                 new Label({ text: "Param Description " + i + "*" }),
        //                 new Input({ value: "{/params/" + (i - 1) + "/description}", placeholder: "Enter Param Description " + i })
        //             ]
        //         });
        //         oParamContainer.addItem(oVBox);
        //     }
        //     var params = [];
        //     for (var j = 0; j < paramCount; j++) {
        //         params.push({ id: "", description: "" });
        //     }
        //     console.log(params);
        //     oModel.setProperty("/params", params);
        // },

        onParamCountChange: function (oEvent) {
            var oModel = this.getView().getModel();
            var paramCount = parseInt(oEvent.getParameter("value")) || 0;
            oModel.setProperty("/paramCount", paramCount);

            var oParamContainer = this.getView().byId("_IDGenVBox8");
            oParamContainer.removeAllItems();

            var params = [];
            for (var i = 1; i <= paramCount; i++) {
                var oVBox = new sap.m.VBox({
                    items: [
                        new sap.m.Label({ text: "ParamID " + i + "*" }),
                        new sap.m.Input({
                            value: {
                                path: "/params/" + (i - 1) + "/id",
                                mode: sap.ui.model.BindingMode.TwoWay
                            },
                            placeholder: "Enter ParamID " + i
                        }),
                        new sap.m.Label({ text: "Param Description " + i + "*" }),
                        new sap.m.Input({
                            value: {
                                path: "/params/" + (i - 1) + "/description",
                                mode: sap.ui.model.BindingMode.TwoWay
                            },
                            placeholder: "Enter Param Description " + i
                        })
                    ]
                });
                oParamContainer.addItem(oVBox);

                // initialize param entry
                params.push({ id: "", description: "" });
            }

            oModel.setProperty("/params", params);
        },

        updateParamIdsText: function () {
            var oModel = this.getView().getModel();
            var params = oModel.getProperty("/params") || [];
            var paramCount = oModel.getProperty("/paramCount");
            var oParamIdsContainer = this.getView().byId("paramIdsContainer");
            oParamIdsContainer.removeAllItems();

            params.forEach((param, index) => {
                var sParamId = (param.id && param.id.trim()) ? param.id : "P" + (index + 1);

                var oButton = new sap.m.Button({
                    text: sParamId,
                    //type: "Emphasized",

                    press: () => {
                        var oTextArea = this.getView().byId("relationInput");
                        var currentValue = oTextArea.getValue();
                        oTextArea.setValue(currentValue + " " + sParamId + " ");
                        oModel.setProperty("/relationText", oTextArea.getValue());
                    },
                    layoutData: new sap.m.FlexItemData({
                        styleClass: "sapUiSmallMarginBegin sapUiSmallMarginEnd"
                    })
                });

                oParamIdsContainer.addItem(oButton);
            });

            // Generate test inputs for Step 4
            var oTestContainer = this.getView().byId("testInputsContainer");
            oTestContainer.removeAllItems();
            var testValues = [];
            for (var k = 0; k < paramCount; k++) {
                var paramId = params[k] ? params[k].id : "Param" + (k + 1);
                console.log(paramId);

                var oLabel = new Label({ text: paramId + " Value:" });
                var oInput = new Input({ value: "{/testValues/" + k + "}", type: "Number" });
                oTestContainer.addItem(oLabel);
                oTestContainer.addItem(oInput);
                testValues.push("");
            }
            oModel.setProperty("/testValues", testValues);
        },

        onShowResult: function () {
            var oModel = this.getView().getModel();
            var relation = oModel.getProperty("/relationText");
            var params = oModel.getProperty("/params");
            var testValues = oModel.getProperty("/testValues");

            var expression = relation;
            for (var i = 0; i < params.length; i++) {
                var paramId = params[i].id;
                var value = testValues[i] || "0"; // Default to 0 if empty
                expression = expression.replace(new RegExp(paramId, 'g'), value);
            }
            try {
                var result = eval(expression);
                // MessageToast.show("Result: " + result);
                sap.m.MessageBox.information("Result: " + result, {
                    title: "Calculation Result",
                    actions: [sap.m.MessageBox.Action.OK],
                    onClose: function (sAction) {
                        if (sAction === sap.m.MessageBox.Action.OK) {
                            console.log("User confirmed result");
                        }
                    }
                });
            } catch (e) {
                MessageToast.show("Invalid expression: " + e.message);
            }
        },

        onSaveFormula: function () {
            var oView = this.getView();
            var oModel = this.getOwnerComponent().getModel(); // OData V4 
            var sName = oView.byId("formulaNameInput").getValue();
            var sDescription = oView.byId("formulaDescriptionInput").getValue();
            var sRelation = oView.byId("relationInput").getValue();
            // var params = oModel.getProperty("/params");
            var oLocalModel = this.getView().getModel(); // unnamed
            var params = oLocalModel.getProperty("/params");
            var paramIds = params.map(p => p.id);
            var paramDescriptions = params.map(p => p.description);
            var numberOfParams = paramIds.length;

            if (!sName || !sDescription) {
                sap.m.MessageToast.show("Please fill in all required fields.");
                return;
            }
            var oPayload = {
                formula: sName,
                description: sDescription,
                numberOfParameters: numberOfParams,
                parameterIds: paramIds,
                parameterDescriptions: paramDescriptions,
                formulaLogic: sRelation,
                expression: sRelation
            };
            fetch("./odata/v4/sales-cloud/Formulas", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oPayload)
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error("Failed to create formula: " + response.statusText);
                    }
                    return response.json();
                })
                .then(data => {
                    // sap.m.MessageToast.show("Formula created successfully!");
                    sap.m.MessageBox.success("Formula saved successfully!,Press OK To return to the main page", {
                        title: "Success",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                                oRouter.navTo("formulas");
                            }
                        }.bind(this)
                    });
                    console.log("Created Formula:", data);
                    var oModel = this.getView().getModel();
                    var aRecords = oModel.getProperty("/Formulas") || [];
                    aRecords.push(data);
                    oModel.setProperty("/Formulas", aRecords);


                    //  Clear inputs 
                    oView.byId("formulaNameInput").setValue("");
                    oView.byId("formulaDescriptionInput").setValue("");
                    oView.byId("relationInput").setValue("");

                    var oTestContainer = this.getView().byId("testInputsContainer");
                    oTestContainer.removeAllItems();

                    // 🔹 Reset params in local model
                    oLocalModel.setProperty("/params", []);
                    oLocalModel.setProperty("/paramCount", 0);
                    oLocalModel.setProperty("/testValues", []);

                })
                .catch(err => {
                    console.error("Error creating Formula:", err);
                    sap.m.MessageBox.error("Error: " + err.message);
                });
        },
        onOperationSelect: function (oEvent) {
            var oTextArea = this.getView().byId("relationInput");
            var selectedKey = oEvent.getParameter("selectedItem").getKey();
            var currentValue = oTextArea.getValue();
            oTextArea.setValue(currentValue + " " + selectedKey + " ");
        },
    });
});