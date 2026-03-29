sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/Dialog",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/Button",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",

], function (Controller, Dialog, VBox, Text, Button, Spreadsheet, exportLibrary, JSONModel, MessageBox) {
    "use strict";
    return Controller.extend("project1.controller.ServiceMaster", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("serviceMaster")
                .attachPatternMatched(this._onRouteMatched, this);


            // Initialize the view model
            var oModel = new sap.ui.model.json.JSONModel({
                ServiceNumbers: []
            });

            // Initialize the edit model
            const oEditModel = new sap.ui.model.json.JSONModel({
                editData: {
                    searchTerm: ""
                }
            });

            // Set models on the view
            this.getView().setModel(oEditModel, "editModel");
            this.getView().setModel(oModel, "view");

            // Set the model on the table explicitly with the "view" name
            //this.getView().byId("serviceMaster").setModel(oModel, "view");

            // Fetch ServiceNumbers data
            fetch("./odata/v4/sales-cloud/ServiceNumbers")
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}, ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched ServiceNumbers:", data); // Log the raw response
                    // Ensure data.value is an array
                    const serviceNumbers = Array.isArray(data.value) ? data.value : [];
                    oModel.setData({ ServiceNumbers: serviceNumbers });
                    console.log("ServiceNumbers set in model:", oModel.getProperty("/ServiceNumbers")); // Log the model data
                    // Refresh the model to ensure the table updates
                    oModel.refresh(true);
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                    sap.m.MessageBox.error("Failed to load ServiceNumbers: " + err.message);
                });

            // Service Types
            fetch("./odata/v4/sales-cloud/ServiceTypes")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    this.getView().setModel(oModel, "serviceTypes");
                });

            // Material Groups
            fetch("./odata/v4/sales-cloud/ServiceTypesMaterialGroups")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    this.getView().setModel(oModel, "materialGroups");
                });

            // Units of Measurement
            fetch("./odata/v4/sales-cloud/UnitOfMeasurements")
                .then(res => res.json())
                .then(data => {
                    var oModel = new sap.ui.model.json.JSONModel(data.value);
                    this.getView().setModel(oModel, "unitsOfMeasurement");
                });
        },

        _onRouteMatched: function () {
            this._loadModels();
        },
        _loadModels: function () {
            const oViewModel = this.getView().getModel("view");
            var oModel = new sap.ui.model.json.JSONModel();
            fetch("./odata/v4/sales-cloud/ServiceNumbers")
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}, ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched ServiceNumbers:", data); // Log the raw response
                    // Ensure data.value is an array
                    const serviceNumbers = Array.isArray(data.value) ? data.value : [];
                    oModel.setData({ ServiceNumbers: serviceNumbers });
                    console.log("ServiceNumbers set in model:", oModel.getProperty("/ServiceNumbers")); // Log the model data
                    this.getView().byId("serviceMaster").setModel(oModel);
                     this.getView().setModel(oModel, "view");
                    // ✅ Update bindings so the table refreshes immediately
                    oViewModel.updateBindings(true);
                    // Refresh the model to ensure the table updates
                    // oModel.refresh(true);
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                    sap.m.MessageBox.error("Failed to load ServiceNumbers: " + err.message);
                });
        },

        onEdit: function () {
            var oTable = this.byId("serviceMaster");
            var oSelectedItem = oTable.getSelectedItem();

            if (!oSelectedItem) {
                sap.m.MessageBox.warning("Please select an item to edit");
                return;
            }

            var oContext = oSelectedItem.getBindingContext("view");
            if (!oContext) {
                sap.m.MessageBox.error("No binding context found for the selected item");
                console.error("Binding context is undefined for selected item:", oSelectedItem);
                return;
            }

            var oSelectedData = oContext.getObject();
            if (!oSelectedData) {
                sap.m.MessageBox.error("No data found for the selected item");
                console.error("Selected data is undefined:", oContext);
                return;
            }

            if (!this._oEditDialog) {
                this._oEditDialog = new sap.m.Dialog({
                    title: "Edit Service Master",
                    titleAlignment: "Center",
                    contentWidth: "700px",
                    resizable: true,
                    draggable: true,
                    content: [],
                    beginButton: new sap.m.Button({
                        text: "Save",
                        type: "Emphasized",
                        press: this.onSaveEdit.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: () => this._oEditDialog.close()
                    })
                });

                this.getView().addDependent(this._oEditDialog);
            }

            var oDialogModel = new sap.ui.model.json.JSONModel({
                editData: Object.assign({}, oSelectedData)
            });
            this._oEditDialog.setModel(oDialogModel, "editModel");

            this._oEditDialog.removeAllContent();

            var oForm = new sap.ui.layout.form.SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4,
                labelSpanM: 4,
                columnsL: 1,
                columnsM: 1,
                maxContainerCols: 2,
                emptySpanL: 1,
                emptySpanM: 1,
                content: []
            });
            oForm.addStyleClass("sapUiSmallMargin sapUiNoContentPadding");

            function addField(label, control) {
                oForm.addContent(new sap.m.Label({ text: label }));
                oForm.addContent(control);
            }

            addField("Service Number Code",
                new sap.m.Input({ value: "{editModel>/editData/serviceNumberCode}", editable: false })
            );

            addField("Service Number",
                new sap.m.Input({ value: "{editModel>/editData/serviceNumberCodeString}", editable: false })
            );

            addField("Search Term",
                new sap.m.Input({ value: "{editModel>/editData/searchTerm}" })
            );

            addField("Description",
                new sap.m.Input({ value: "{editModel>/editData/description}" })
            );
            addField("Service Text",
                new sap.m.Input({ value: "{editModel>/editData/serviceText}" })
            );

            addField("Service Type",
                new sap.m.Select({
                    items: {
                        path: "serviceTypes>/",
                        template: new sap.ui.core.Item({
                            key: "{serviceTypes>serviceTypeCode}",
                            text: "{serviceTypes>description}"
                        })
                    },
                    selectedKey: "{editModel>/editData/serviceTypeCode}"
                })
            );

            addField("Material Group",
                new sap.m.Select({
                    items: {
                        path: "materialGroups>/",
                        template: new sap.ui.core.Item({
                            key: "{materialGroups>materialGroupCode}",
                            text: "{materialGroups>description}"
                        })
                    },
                    selectedKey: "{editModel>/editData/materialGroupCode}"
                })
            );

            addField("Base Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{editModel>/editData/baseUnitOfMeasurement}"
                })
            );

            addField("Number To Be Converted",
                new sap.m.Input({ value: "{editModel>/editData/numberToBeConverted}" })
            );
            addField("To Be Converted Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{editModel>/editData/toBeConvertedUnitOfMeasurement}",
                    width: "100%"
                })
            );
            addField("Converted Number",
                new sap.m.Input({ value: "{editModel>/editData/convertedNumber}" })
            );

            addField(" Converted Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{editModel>/editData/defaultUnitOfMeasurement}",
                    width: "100%"
                })
            );
            addField("Main Item",
                new sap.m.CheckBox({
                    selected: "{editModel>/editData/mainItem}",
                    // text: "Is Main Item"
                })
            );

            addField("Short Text Change Allowed",
                new sap.m.CheckBox({
                    selected: "{editModel>/editData/shortTextChangeAllowed}",
                    // text: "Allowed"
                })
            );

            addField("Deletion Indicator",
                new sap.m.CheckBox({
                    selected: "{editModel>/editData/deletionIndicator}",
                    // text: "Marked for Deletion"
                })
            );
            var oScroll = new sap.m.ScrollContainer({
                height: "500px",
                vertical: true,
                content: [oForm]
            });

            this._oEditDialog.addContent(oScroll);
            this._oEditDialog.open();
        },

        onSaveEdit: function () {
            var oDialogModel = this._oEditDialog.getModel("editModel");
            var oData = oDialogModel.getProperty("/editData");
            console.log(oData);


            if (oData.lastChangeDate instanceof Date) {
                oData.lastChangeDate = oData.lastChangeDate.toISOString().split("T")[0];
            } else if (typeof oData.lastChangeDate === "string" && oData.lastChangeDate.includes("/")) {
                var parts = oData.lastChangeDate.split("/");
                if (parts.length === 3) {
                    let mm = parts[0].padStart(2, "0");
                    let dd = parts[1].padStart(2, "0");
                    let yy = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                    oData.lastChangeDate = `${yy}-${mm}-${dd}`;
                }
            }

            var oCleanData = {
                serviceNumberCode: oData.serviceNumberCode,
                searchTerm: oData.searchTerm,
                description: oData.description,
                serviceTypeCode: oData.serviceTypeCode,
                materialGroupCode: oData.materialGroupCode,
                // lastChangeDate: oData.lastChangeDate,
                serviceText: oData.serviceText,
                mainItem: oData.mainItem, // checkbox
                shortTextChangeAllowed: oData.shortTextChangeAllowed, // checkbox
                deletionIndicator: oData.deletionIndicator, // checkbox
                convertedNumber: oData.convertedNumber,
                numberToBeConverted: oData.numberToBeConverted,
                toBeConvertedUnitOfMeasurement: oData.toBeConvertedUnitOfMeasurement, // dropdown
                defaultUnitOfMeasurement: oData.defaultUnitOfMeasurement, // dropdown,
                baseUnitOfMeasurement: oData.baseUnitOfMeasurement

            };
            console.log(oCleanData);



            fetch(`./odata/v4/sales-cloud/ServiceNumbers(${oData.serviceNumberCode})`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oCleanData)
            })
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    return res.json(); // Assuming the server returns the updated object
                })
                .then(updated => {
                    sap.m.MessageToast.show("Service updated successfully");

                    var oTableModel = this.getView().byId("serviceMaster").getModel("view");
                    var aMasters = oTableModel.getProperty("/ServiceNumbers") || [];

                    // Find the index of the updated item
                    var iIndex = aMasters.findIndex(x => x.serviceNumberCode === oData.serviceNumberCode);
                    if (iIndex > -1) {
                        aMasters[iIndex] = { ...aMasters[iIndex], ...oCleanData };
                        console.log(aMasters);

                        oTableModel.setProperty("/ServiceNumbers", aMasters);
                        oTableModel.refresh(true);
                    } else {
                        console.error("Updated item not found in ServiceNumbers array");
                    }

                    // Close the dialog
                    this._oEditDialog.close();
                })
                .catch(err => {
                    console.error("Update failed", err);
                    sap.m.MessageBox.error("Update failed: " + err.message);
                });
        },

        onNavigateToAddServiceMaster() {
            this.getOwnerComponent().getRouter().navTo("addServiceMaster");
        },

        onShowDetails: function () {
            var oTable = this.byId("serviceMaster");
            var oSelectedItem = oTable.getSelectedItem();

            if (!oSelectedItem) {
                sap.m.MessageBox.warning("Please, select an item");
                return;
            }

            var oContext = oSelectedItem.getBindingContext("view");
            var oSelectedData = oContext.getObject();

            // Create dialog if not already created
            if (!this._oValueHelpDialog) {
                this._oValueHelpDialog = new sap.m.Dialog({
                    title: "Service Master Details",
                    titleAlignment: "Center",
                    contentWidth: "800px",
                    resizable: true,
                    draggable: true,
                    content: [],
                    endButton: new sap.m.Button({
                        text: "Close",
                        press: () => this._oValueHelpDialog.close()
                    })
                });

                this.getView().addDependent(this._oValueHelpDialog);
            }

            // Update title dynamically
            this._oValueHelpDialog.setTitle("Service Master: " + (oSelectedData.description || ""));

            // Clear previous content
            this._oValueHelpDialog.removeAllContent();

            // Prepare content items dynamically from JSON keys
            // Prepare fields
            var aFields = [
                { label: "Service Master Code", value: oSelectedData.serviceNumberCode },
                { label: "Service Number", value: oSelectedData.serviceNumberCodeString },
                { label: "Search Term", value: oSelectedData.searchTerm },
                { label: "Description", value: oSelectedData.description },
                { label: "Service Text", value: oSelectedData.serviceText },
                { label: "Service Type Code", value: oSelectedData.serviceTypeCode },
                { label: "Material Group Code", value: oSelectedData.materialGroupCode },
                { label: "Base Unit of Measurement", value: oSelectedData.baseUnitOfMeasurement },
                // { label: "Default Unit of Measurement", value: oSelectedData.defaultUnitOfMeasurement },
                { label: "Number To Be Converted", value: oSelectedData.numberToBeConverted },
                { label: "To Be Converted Unit of Measurement", value: oSelectedData.toBeConvertedUnitOfMeasurement },
                { label: "Converted Number", value: oSelectedData.convertedNumber },
                { label: "Converted Unit of Measurement", value: oSelectedData.defaultUnitOfMeasurement },
                // { label: "Unit of Measurement Code", value: oSelectedData.unitOfMeasurementCode },
                { label: "Main Item", value: oSelectedData.mainItem ? "Yes" : "No" },
                { label: "Short Text Change Allowed", value: oSelectedData.shortTextChangeAllowed ? "Yes" : "No" },
                { label: "Deletion Indicator", value: oSelectedData.deletionIndicator ? "Yes" : "No" },
                // { label: "Created At", value: oSelectedData.createdAt },
                // { label: "Created By", value: oSelectedData.createdBy },
                // { label: "Modified At", value: oSelectedData.modifiedAt },
                // { label: "Modified By", value: oSelectedData.modifiedBy },
                { label: "Last Change Date", value: oSelectedData.lastChangeDate }
            ];

            // Create layout for details
            var oFormLayout = new sap.ui.layout.form.SimpleForm({
                editable: false,
                layout: "ResponsiveGridLayout",
                labelSpanM: 4,
                labelSpanL: 4,
                emptySpanL: 1,
                emptySpanM: 1,
                columnsL: 1,
                columnsM: 1,
                maxContainerCols: 2,
                content: []
            });

            // Add left-right padding
            oFormLayout.addStyleClass("sapUiSmallMargin sapUiNoContentPadding");

            // Add each field as label-input pair
            aFields.forEach(function (field) {
                oFormLayout.addContent(new sap.m.Label({ text: field.label }));
                oFormLayout.addContent(
                    new sap.m.Input({
                        value: field.value != null ? field.value.toString() : "",
                        editable: false,
                        width: "100%"
                    })
                );
            });

            // Add scroll container for long lists
            var oScrollContainer = new sap.m.ScrollContainer({
                height: "400px",
                vertical: true,
                content: [oFormLayout]
            });

            this._oValueHelpDialog.addContent(oScrollContainer);
            this._oValueHelpDialog.open();

        },
        _generateUUID: function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },
        onCopy: function () {
            var oTable = this.byId("serviceMaster");
            var oSelectedItem = oTable.getSelectedItem();

            if (!oSelectedItem) {
                sap.m.MessageBox.warning("Please select an item to copy");
                return;
            }

            var oContext = oSelectedItem.getBindingContext("view");
            if (!oContext) {
                sap.m.MessageBox.error("No binding context found for the selected item");
                console.error("Binding context is undefined for selected item:", oSelectedItem);
                return;
            }

            var oSelectedData = Object.assign({}, oContext.getObject());
            if (!oSelectedData) {
                sap.m.MessageBox.error("No data found for the selected item");
                return;
            }

            // Generate new ID for the copied item
            var sNewCode = this._generateUUID();
            oSelectedData.serviceNumberCode = sNewCode;
            oSelectedData.serviceNumberCodeString = sNewCode; // optional if needed

            if (!this._oCopyDialog) {
                this._oCopyDialog = new sap.m.Dialog({
                    title: "Copy Service Master",
                    titleAlignment: "Center",
                    contentWidth: "700px",
                    resizable: true,
                    draggable: true,
                    content: [],
                    beginButton: new sap.m.Button({
                        text: "Save",
                        type: "Emphasized",
                        press: this._onCopySave.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: () => this._oCopyDialog.close()
                    })
                });

                this.getView().addDependent(this._oCopyDialog);
            }

            var oDialogModel = new sap.ui.model.json.JSONModel({
                copyData: Object.assign({}, oSelectedData)
            });
            this._oCopyDialog.setModel(oDialogModel, "copyModel");

            this._oCopyDialog.removeAllContent();

            var oForm = new sap.ui.layout.form.SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4,
                labelSpanM: 4,
                columnsL: 1,
                columnsM: 1,
                maxContainerCols: 2,
                emptySpanL: 1,
                emptySpanM: 1,
                content: []
            });
            oForm.addStyleClass("sapUiSmallMargin sapUiNoContentPadding");

            function addField(label, control) {
                oForm.addContent(new sap.m.Label({ text: label }));
                oForm.addContent(control);
            }

            addField("Service Number Code",
                new sap.m.Input({ value: "{copyModel>/copyData/serviceNumberCode}", editable: false })
            );

            addField("Search Term",
                new sap.m.Input({ value: "{copyModel>/copyData/searchTerm}" })
            );

            addField("Description",
                new sap.m.Input({ value: "{copyModel>/copyData/description}" })
            );

            addField("Service Text",
                new sap.m.Input({ value: "{copyModel>/copyData/serviceText}" })
            );

            addField("Service Type",
                new sap.m.Select({
                    items: {
                        path: "serviceTypes>/",
                        template: new sap.ui.core.Item({
                            key: "{serviceTypes>serviceTypeCode}",
                            text: "{serviceTypes>description}"
                        })
                    },
                    selectedKey: "{copyModel>/copyData/serviceTypeCode}"
                })
            );

            addField("Material Group",
                new sap.m.Select({
                    items: {
                        path: "materialGroups>/",
                        template: new sap.ui.core.Item({
                            key: "{materialGroups>materialGroupCode}",
                            text: "{materialGroups>description}"
                        })
                    },
                    selectedKey: "{copyModel>/copyData/materialGroupCode}"
                })
            );

            addField("Base Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{copyModel>/copyData/baseUnitOfMeasurement}"
                })
            );

            addField("Number To Be Converted",
                new sap.m.Input({ value: "{copyModel>/copyData/numberToBeConverted}" })
            );

            addField("To Be Converted Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{copyModel>/copyData/toBeConvertedUnitOfMeasurement}",
                    width: "100%"
                })
            );

            addField("Converted Number",
                new sap.m.Input({ value: "{copyModel>/copyData/convertedNumber}" })
            );

            addField("Converted Unit of Measurement",
                new sap.m.Select({
                    items: {
                        path: "unitsOfMeasurement>/",
                        template: new sap.ui.core.Item({
                            key: "{units>code}",
                            text: "{units>description}"
                        })
                    },
                    selectedKey: "{copyModel>/copyData/defaultUnitOfMeasurement}",
                    width: "100%"
                })
            );

            addField("Main Item",
                new sap.m.CheckBox({ selected: "{copyModel>/copyData/mainItem}" })
            );

            addField("Short Text Change Allowed",
                new sap.m.CheckBox({ selected: "{copyModel>/copyData/shortTextChangeAllowed}" })
            );

            addField("Deletion Indicator",
                new sap.m.CheckBox({ selected: "{copyModel>/copyData/deletionIndicator}" })
            );

            var oScroll = new sap.m.ScrollContainer({
                height: "500px",
                vertical: true,
                content: [oForm]
            });

            this._oCopyDialog.addContent(oScroll);
            this._oCopyDialog.open();
        },

        _onCopySave: function () {
            var oDialogModel = this._oCopyDialog.getModel("copyModel");
            var oData = oDialogModel.getProperty("/copyData");
            console.log("Copy Data:", oData);

            var oPayload = {
                serviceNumberCode: this._generateUUID(),
                //oData.serviceNumberCode,
                searchTerm: oData.searchTerm,
                description: oData.description,
                serviceTypeCode: oData.serviceTypeCode,
                materialGroupCode: oData.materialGroupCode,
                serviceText: oData.serviceText,
                mainItem: oData.mainItem,
                shortTextChangeAllowed: oData.shortTextChangeAllowed,
                deletionIndicator: oData.deletionIndicator,
                convertedNumber: oData.convertedNumber,
                numberToBeConverted: oData.numberToBeConverted,
                toBeConvertedUnitOfMeasurement: oData.toBeConvertedUnitOfMeasurement,
                defaultUnitOfMeasurement: oData.defaultUnitOfMeasurement,
                baseUnitOfMeasurement: oData.baseUnitOfMeasurement
            };

            fetch("./odata/v4/sales-cloud/ServiceNumbers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oPayload)
            })
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    return res.json();
                })
                // .then(created => {
                //     sap.m.MessageToast.show("Service copied successfully");

                //     var oViewModel = this.getView().getModel("view");
                //     var aData = oViewModel.getProperty("/ServiceNumbers") || [];

                //     // ✅ Replace array to trigger re-render
                //     oViewModel.setProperty("/ServiceNumbers", [...aData, created]);
                //     var oTable = this.byId("serviceMaster");
                //     oTable.getBinding("items").refresh();


                //     // Close dialog
                //     this._oCopyDialog.close();
                // })

                .then(created => {
                    sap.m.MessageToast.show("Service copied successfully");

                    var oViewModel = this.getView().getModel("view");
                    var aData = oViewModel.getProperty("/ServiceNumbers") || [];

                    aData.push(created);
                    oViewModel.setProperty("/ServiceNumbers", aData);
                    console.log("Updated ServiceNumbers array:", oViewModel.getProperty("/ServiceNumbers"));
                    oViewModel.refresh(true);

                    //  Verify table binding
                    var oTable = this.byId("serviceMaster");
                    console.log("Table items binding:", oTable.getBinding("items")); // Debug: Log binding
                    this._loadModels();


                    var oTableModel = this.getView().byId("serviceMaster").getModel("view");
                    var aMasters = oTableModel.getProperty("/ServiceNumbers") || [];
                    oTableModel.setProperty("/ServiceNumbers", aMasters);
                    oTableModel.refresh(true);


                    this._oCopyDialog.close();
                })
                .catch(err => {
                    console.error("Copy failed:", err);
                    sap.m.MessageBox.error("Copy failed: " + err.message);
                });
        },


        onExport: function () {
            var oModel = this.getView().getModel("view"); // Use the 'view' model
            var aData = oModel.getProperty("/ServiceNumbers"); // Correct path

            if (!aData || aData.length === 0) {
                sap.m.MessageBox.warning("No data available to export");
                return;
            }

            // Define the Excel columns with correct property names
            var aColumns = [
                { label: "Service Master Code", property: "serviceNumberCode" },
                { label: "Search Term", property: "searchTerm" },
                { label: "Description", property: "description" },
                { label: "Last Changed Date", property: "lastChangeDate" },
                { label: "Service Type", property: "serviceText" }
                // Remove 'CreatedOn' unless it exists in the data
            ];

            // Settings for Spreadsheet
            var oSettings = {
                workbook: { columns: aColumns },
                dataSource: aData,
                fileName: "ServiceMaster.xlsx",
                worker: false // Set to true for large datasets
            };

            var oSheet = new sap.ui.export.Spreadsheet(oSettings);
            oSheet.build()
                .then(() => {
                    sap.m.MessageToast.show("Export finished!");
                })
                .finally(() => {
                    oSheet.destroy();
                });
        },
        onDeletePress: function () {
            var oTable = this.byId("serviceMaster");
            var oSelectedItem = oTable.getSelectedItem();
            console.log(oSelectedItem);


            if (!oSelectedItem) {
                MessageBox.warning("Please select a row to delete");
                return;
            }

            var oContext = oSelectedItem.getBindingContext("view");
            if (!oContext) {
                MessageBox.error("No binding context found for the selected item");
                console.error("Binding context is undefined for selected item:", oSelectedItem);
                return;
            }

            var oSelectedData = oContext.getObject();
            if (!oSelectedData || !oSelectedData.serviceNumberCode) {
                MessageBox.error("Invalid data selected for deletion");
                console.error("Selected data is invalid:", oSelectedData);
                return;
            }

            var sServiceNumberCode = oSelectedData.serviceNumberCode;
            console.log("Deleting ServiceNumber with code:", sServiceNumberCode); // Debug: Log serviceNumberCode

            // Confirm deletion
            MessageBox.confirm("Are you sure you want to delete this service master?", {
                title: "Confirm Deletion",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        // Send DELETE request
                        fetch(`./odata/v4/sales-cloud/ServiceNumbers('${(sServiceNumberCode)}')`, {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" }
                        })
                            .then(response => {
                                if (!response.ok) {
                                    return response.json().then(e => { throw new Error(e.error?.message || response.statusText); });
                                }
                                MessageToast.show("Service Master deleted successfully!");

                                // Update the view model
                                var oViewModel = this.getView().getModel("view");
                                var aData = oViewModel.getProperty("/ServiceNumbers") || [];
                                console.log("Current ServiceNumbers array:", aData); // Debug: Log current array

                                var iIndex = aData.findIndex(x => x.serviceNumberCode === sServiceNumberCode);
                                if (iIndex > -1) {
                                    aData.splice(iIndex, 1); // Remove the deleted item
                                    oViewModel.setProperty("/ServiceNumbers", aData);
                                    oViewModel.refresh(true);
                                    console.log("Updated ServiceNumbers array:", oViewModel.getProperty("/ServiceNumbers")); // Debug: Log updated array
                                } else {
                                    console.warn("Deleted item not found in ServiceNumbers array");
                                }

                                // Clear selection
                                oTable.removeSelections(true);
                            })
                            .catch(err => {
                                console.error("Error deleting Service Master:", err);
                                MessageBox.error("Failed to delete Service Master: " + err.message);
                            });
                    }
                }.bind(this)
            });
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var oTable = this.byId("serviceMaster");
            var oBinding = oTable.getBinding("items");

            if (sQuery && sQuery.length > 0) {
                // Filter on multiple columns with correct property names
                var oFilter1 = new sap.ui.model.Filter("serviceNumberCode", sap.ui.model.FilterOperator.Contains, sQuery);
                var oFilter2 = new sap.ui.model.Filter("searchTerm", sap.ui.model.FilterOperator.Contains, sQuery);
                var oFilter3 = new sap.ui.model.Filter("description", sap.ui.model.FilterOperator.Contains, sQuery);

                var oCombinedFilter = new sap.ui.model.Filter({
                    filters: [oFilter1, oFilter2, oFilter3],
                    and: false // OR logic
                });

                oBinding.filter([oCombinedFilter]);
            } else {
                oBinding.filter([]);
            }
        },
    });
});


