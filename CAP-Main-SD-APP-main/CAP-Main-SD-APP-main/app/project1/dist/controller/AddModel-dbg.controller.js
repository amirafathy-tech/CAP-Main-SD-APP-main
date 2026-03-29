

sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("project1.controller.AddModel", {
        onInit() {
            var oView = this.getView();

            // Initialize the view model
            var oViewModel = new sap.ui.model.json.JSONModel({

            });
            oView.setModel(oViewModel, "view");

            // currency
            fetch("./odata/v4/sales-cloud/Currencies")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    oView.setModel(oModel, "currencies");
                });
        },
        onAddModel: function () {
            const modelServSpec = this.byId("modelServSpec").getValue();
            const blockingIndicator = this.byId("blockingIndicator").getSelected();
            const serviceSelection = this.byId("serviceSelection").getSelected();
            const oDescriptionInput = this.byId("description");
            const description = oDescriptionInput.getValue();
            const searchTerm = this.byId("searchTerm").getValue();
            const currencyInput = this.byId("currency")
            const currency = this.byId("currency").getSelectedKey();

            if (!description) {
                oDescriptionInput.setValueState("Error");
                oDescriptionInput.setValueStateText("Description is required");
                sap.m.MessageToast.show("Description is required");
                return;
            }
            if (!currency) {
                currencyInput.setValueState("Error");
                currencyInput.setValueStateText("Currency is required");
                sap.m.MessageToast.show("Currency is required");
                return;
            }

            const newModel = {
                modelServSpec: modelServSpec,
                blockingIndicator: blockingIndicator,
                serviceSelection: serviceSelection,
                description: description,
                searchTerm: searchTerm,
                currencyCode: currency,
              //  modelSpecDetailsCode: [],
                modelSpecCode: Math.floor(Date.now() / 1000),
                lastChangeDate: new Date().toISOString().split("T")[0],
                //modelSpecificationsDetails_modelSpecDetailsCode: 0

            };
            console.log(newModel);
            

            {

            }

            fetch("./odata/v4/sales-cloud/ModelSpecifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newModel)
            })
                .then(response => {
                    if (!response.ok) {
                        console.log(response.statusText);
                        throw new Error("Failed to create model: " + response.statusText);


                    }
                    return response.json();
                })
                .then(data => {
                    sap.m.MessageBox.success("Model saved successfully!,Press OK To return to the main page", {
                        title: "Success",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                                oRouter.navTo("model");
                            }
                        }.bind(this)
                    });

                    this.byId("modelServSpec").setValue("");
                    this.byId("blockingIndicator").setSelected(false);
                    this.byId("serviceSelection").setSelected(false);
                    this.byId("description").setValue("");
                    this.byId("searchTerm").setValue("");
                    this.byId("currency").setValue("");

                    // optional: refresh table if you show models
                    // let oTable = this.byId("modelTable");
                    // oTable.getBinding("items").refresh();
                })
                .catch(err => {
                    sap.m.MessageBox.error("Error: " + err.message);
                });
        }


    });
});