sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("project1.controller.AddServiceMaster", {
        onInit: function () {
            var oView = this.getView();

            // Initialize the view model
            var oViewModel = new sap.ui.model.json.JSONModel({
                ServiceNumbers: []
            });
            oView.setModel(oViewModel, "view");

            // Fetch ServiceNumbers data
            fetch("./odata/v4/sales-cloud/ServiceNumbers")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched ServiceNumbers:", data.value); // Debug: Log data
                    oViewModel.setData({ ServiceNumbers: Array.isArray(data.value) ? data.value : [] });
                    oViewModel.refresh(true);
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                    sap.m.MessageBox.error("Failed to load ServiceNumbers: " + err.message);
                });

            // Bind to routeMatched event for navigation
            this.getOwnerComponent().getRouter().getRoute("serviceMaster").attachMatched(this._onRouteMatched, this);

            // Service Types
            fetch("./odata/v4/sales-cloud/ServiceTypes")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    oView.setModel(oModel, "serviceTypes");
                });

            // Material Groups
            fetch("./odata/v4/sales-cloud/MaterialGroups")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    oView.setModel(oModel, "materialGroups");
                });

            // Units of Measurement
            fetch("./odata/v4/sales-cloud/UnitOfMeasurements")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    oView.setModel(oModel, "unitsOfMeasurement");
                });
        },

        _onRouteMatched: function (oEvent) {
            var oArguments = oEvent.getParameter("arguments");
            var oViewModel = this.getView().getModel("view");

            // Refetch ServiceNumbers to ensure table updates after navigation
            fetch("./odata/v4/sales-cloud/ServiceNumbers")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Refetched ServiceNumbers on route matched:", data.value);
                    oViewModel.setData({ ServiceNumbers: Array.isArray(data.value) ? data.value : [] });
                    oViewModel.refresh(true);
                    console.log("Updated ServiceNumbers array:", oViewModel.getProperty("/ServiceNumbers"));
                })
                .catch(err => {
                    console.error("Error refetching ServiceNumbers:", err);
                    sap.m.MessageBox.error("Failed to refresh table: " + err.message);
                });
        },

        _generateUUID: function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        _isValidNumber: function (sValue) {
            return !isNaN(parseInt(sValue, 10)) && sValue.trim() !== "";
        },

        onAddPress: function () {
            var oView = this.getView();

            // Collect values from inputs
            var serviceNumber = oView.byId("_IDGenInput1").getValue();
            var searchTerm = oView.byId("_IDGenInput2").getValue();
            var description = oView.byId("_IDGenInput3").getValue();
            var serviceText = oView.byId("_IDGenInput4").getValue();
            var shortTextAllowed = oView.byId("_IDGenCheckBox1").getSelected();
            var deletionIndicator = oView.byId("_IDGenCheckBox3").getSelected();
            var toBeConvertedNum = oView.byId("_IDGenInput5").getValue();
            var convertedNum = oView.byId("_IDGenInput9").getValue();
            var serviceTypeCode = oView.byId("_IDGenSelect5").getSelectedKey();
            var unitOfMeasurementCode = oView.byId("_IDGenSelect1").getSelectedKey();
            var toBeConvertedUOM = oView.byId("_IDGenSelect2").getSelectedKey();
            var convertedUOM = oView.byId("_IDGenSelect3").getSelectedKey();
            var materialGroupCode = oView.byId("_IDGenSelect4").getSelectedKey();
            var mainItem = oView.byId("_IDGenCheckBox4").getSelected();

            // Validate inputs
            if (!this._isValidNumber(serviceNumber)) {
                sap.m.MessageBox.error("Please enter a valid Service Number (ID).");
                return;
            }
            if (!searchTerm || !description) {
                sap.m.MessageBox.error("Search Term and Description are required.");
                return;
            }

            // Build payload
            var newServiceMaster = {
                serviceNumberCode: this._generateUUID(),
                serviceNumberCodeString: `SN-${serviceNumber.padStart(3, "0")}`,
                noServiceNumber: parseInt(serviceNumber, 10),
                searchTerm: searchTerm,
                description: description,
                serviceText: serviceText || null,
                shortTextChangeAllowed: shortTextAllowed,
                deletionIndicator: deletionIndicator,
                numberToBeConverted: this._isValidNumber(toBeConvertedNum) ? parseInt(toBeConvertedNum, 10) : null,
                convertedNumber: this._isValidNumber(convertedNum) ? parseInt(convertedNum, 10) : null,
                serviceTypeCode: serviceTypeCode || null,
                unitOfMeasurementCode: unitOfMeasurementCode || null,
                toBeConvertedUnitOfMeasurement: toBeConvertedUOM || null,
                defaultUnitOfMeasurement: convertedUOM || null,
                mainItem: mainItem,
                materialGroupCode: materialGroupCode || null,
                lastChangeDate: new Date().toISOString().split("T")[0]
            };

            console.log("Payload to be sent:", newServiceMaster);

            // POST to CAP service
            fetch("./odata/v4/sales-cloud/ServiceNumbers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newServiceMaster)
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(e => { throw new Error(e.error?.message || response.statusText); });
                    }
                    return response.json().catch(() => newServiceMaster); // Handle empty response
                })
                .then(savedItem => {
                     sap.m.MessageBox.success("ServiceMaster saved successfully!,Press OK To return to the main page", {
                        title: "Success",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                                oRouter.navTo("serviceMaster");
                            }
                        }.bind(this)
                    })
                })
                .catch(err => {
                    console.error("Error saving ServiceMaster:", err);
                    sap.m.MessageBox.error("Error: " + err.message);
                });
        },
     
        
        // onNavigateToServiceMaster() {
        //     this.getOwnerComponent().getRouter().navTo("serviceMaster");
        // },
       
    });
});
