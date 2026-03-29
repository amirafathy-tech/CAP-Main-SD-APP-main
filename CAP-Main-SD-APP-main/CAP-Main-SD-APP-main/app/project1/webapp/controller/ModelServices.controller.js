sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/ui/layout/form/SimpleForm",
], function (Controller, MessageBox, MessageToast, SimpleForm, Spreadsheet, exportLibrary, Dialog, Input, Button, Label, VBox, HBox, Table, Column, ColumnListItem) {
    "use strict";
    return Controller.extend("project1.controller.ModelServices", {
        onInit: function () {
            var oModel = new sap.ui.model.json.JSONModel({
                ModelServices: [],
                Formulas: [],
                Currency: [],
                ModelSpecRec: {},
                LineTypes: [],
                UOM: [],
                personnelNumbers: [],
                ServiceTypes: [],
                ServiceNumbers: [],
                MatGroups: [], // Added for Material Groups
                FormulaParameters: {},
                HasSelectedFormula: false,
                Total: 0,
                SubTotal: 0,
                IsFormulaBasedQuantity: false,
                ServiceNumbers: [],
                SelectedServiceNumber: "",
                SelectedServiceNumberDescription: "",
                SubDescriptionEditable: true,
                SelectedFormula: null,
                totalWithProfit: 0,
                amountPerUnitWithProfit: 0,
            });
            this.getView().setModel(oModel, "view");
            // Removed general fetch for ModelSpecificationsDetails as we load specific in route matched
            fetch("./odata/v4/sales-cloud/ServiceNumbers")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched ServiceNumbers:", data.value);

                    if (data && data.value) {
                        const ServiceNumbers = data.value.map(item => ({
                            serviceNumberCode: item.serviceNumberCode,
                            description: item.description
                        }));
                        this.getView().getModel().setProperty("/ServiceNumbers", ServiceNumbers);

                        console.log("ServiceNumbers:", ServiceNumbers);
                    }
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                });
            fetch("./odata/v4/sales-cloud/PersonnelNumbers")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched personnelNumbers:", data.value);

                    if (data && data.value) {
                        const personnelNumbers = data.value.map(item => ({
                            serviceNumberCode: item.serviceNumberCode,
                            description: item.description
                        }));
                        this.getView().getModel().setProperty("/personnelNumbers", personnelNumbers);

                        console.log("personnelNumbers:", personnelNumbers);
                    }
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                });
            fetch("./odata/v4/sales-cloud/ServiceTypes")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched ServiceTypes:", data.value);

                    if (data && data.value) {
                        const ServiceTypes = data.value.map(item => ({
                            serviceNumberCode: item.serviceNumberCode,
                            description: item.description
                        }));
                        this.getView().getModel().setProperty("/ServiceTypes", ServiceTypes);

                        console.log("ServiceTypes:", ServiceTypes);
                    }
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                });
            fetch("./odata/v4/sales-cloud/LineTypes")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched LineTypes:", data.value);

                    if (data && data.value) {
                        const LineTypes = data.value.map(item => ({
                            serviceNumberCode: item.serviceNumberCode,
                            description: item.description
                        }));
                        this.getView().getModel().setProperty("/LineTypes", LineTypes);

                        console.log("LineTypes:", LineTypes);
                    }
                })
                .catch(err => {
                    console.error("Error fetching ServiceNumbers:", err);
                });
            // Fetch Formulas
            fetch("./odata/v4/sales-cloud/Formulas")
                .then(r => r.json())
                .then(data => {
                    const formulas = Array.isArray(data.value) ? data.value : [];
                    console.log("Fetched Formulas:", formulas); // Debug
                    oModel.setProperty("/Formulas", formulas);
                    oModel.refresh(true);
                })
                .catch(err => {
                    console.error("Error fetching Formulas:", err);
                    sap.m.MessageToast.show("Failed to load formulas.");
                });
            fetch("./odata/v4/sales-cloud/UnitOfMeasurements")
                .then(r => r.json())
                .then(data => {
                    const uom = Array.isArray(data.value) ? data.value : [];
                    oModel.setProperty("/UOM", uom);
                    oModel.refresh(true);
                });

            // Fetch Currencies
            fetch("./odata/v4/sales-cloud/Currencies")
                .then(r => r.json())
                .then(data => {
                    const currency = Array.isArray(data.value) ? data.value : [];
                    oModel.setProperty("/Currency", currency);
                    oModel.refresh(true);
                });
            // Added fetch for MaterialGroups (assuming endpoint and fields match others)
            fetch("./odata/v4/sales-cloud/MaterialGroups")
                .then(response => {
                    if (!response.ok) throw new Error(response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Fetched MaterialGroups:", data.value);

                    if (data && data.value) {
                        const MatGroups = data.value.map(item => ({
                            materialGroupCode: item.materialGroupCode,
                            description: item.description
                        }));
                        this.getView().getModel().setProperty("/MatGroups", MatGroups);

                        console.log("MatGroups:", MatGroups);
                    }
                })
                .catch(err => {
                    console.error("Error fetching MaterialGroups:", err);
                });
            this.getView().setModel(oModel);
            this.getOwnerComponent().getRouter()
                .getRoute("modelServices")
                .attachPatternMatched(this._onObjectMatched, this);


        },
        _onObjectMatched: function (oEvent) {
            const sModelSpecCode = oEvent.getParameter("arguments").modelSpecCode;
            // const sModelSpecRec = oEvent.getParameter("arguments").Record;
            // const oModel = this.getView().getModel("view");
            // oModel.setProperty("/ModelSpecRec", sModelSpecRec)
            // console.log("sModelSpecRec",sModelSpecRec);

            console.log("Navigated with modelSpecCode:", sModelSpecCode);
            this.currentModelSpecCode = sModelSpecCode;

            this._loadModelSpecificationDetails(sModelSpecCode);

        },
        _loadModelSpecificationDetails: function (sModelSpecCode) {
            const oModel = this.getView().getModel("view");
            const sUrl = `./odata/v4/sales-cloud/ModelSpecifications(${sModelSpecCode})?$expand=modelSpecificationsDetails`;
            console.log(sUrl);

            fetch(sUrl)
                .then(response => response.json())
                .then(data => {
                    console.log("API Resp:", data);
                    console.log("The Model Specification Details:", data.modelSpecificationsDetails);

                    // The DB stores description text directly in unitOfMeasurementCode /
                    // currencyCode / formulaCode (they are String fields, not FK UUIDs).
                    // The table columns bind to the virtual *Description fields, so we
                    // just copy the stored value across here on every load.
                    const aDetails = (data.modelSpecificationsDetails || []).map(item => ({
                        ...item,
                        unitOfMeasurementDescription: item.unitOfMeasurementCode || "",
                        currencyDescription:          item.currencyCode           || "",
                        formulaDescription:           item.formulaCode            || ""
                    }));

                    oModel.setProperty("/ModelServices", aDetails);
                    console.log("Fetched ModelServices for", sModelSpecCode, aDetails);

                    // Update total after loading data
                    this.updateTotalValue();
                })
                .catch(err => {
                    console.error("Error fetching ModelSpecificationDetails:", err);
                    sap.m.MessageToast.show("Failed to load model details.");
                });
        },
        updateTotalValue: function () {
            const oModel = this.getView().getModel(); // Default model (with /ModelServices)
            const aServices = oModel.getProperty("/ModelServices") || [];
            const iTotal = aServices.reduce((sum, row) => sum + (parseFloat(row.netValue) || 0), 0);
            oModel.setProperty("/Total", parseFloat(iTotal.toFixed(3)));
            console.log("Updated Total Value:", iTotal);
        },
        onServiceNumberChange: function (oEvent) {
            var oSelect = oEvent.getSource();
            var oSelectedItem = oSelect.getSelectedItem();
            var oDescriptionInput = this.byId("mainShortTextInput");
            var oDescSubItems = this.byId("dialogSubDescription")
            if (oSelectedItem) {
                var sKey = oSelectedItem.getKey();   // serviceNumberCode
                var sText = oSelectedItem.getText(); // description

                console.log("Selected Key:", sKey, " | Text:", sText);

                // Store both in model
                var oModel = this.getView().getModel();
                oModel.setProperty("/SelectedServiceNumber", sKey);
                oModel.setProperty("/SelectedServiceNumberDescription", sText);

                // Fill input & lock it
                oDescriptionInput.setValue(sText);
                oDescriptionInput.setEditable(false);
            } else {
                // If nothing selected -> clear & allow manual typing
                oDescriptionInput.setValue("");
                oDescriptionInput.setEditable(true);
            }
        },
        onInputChange: function (oEvent) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var oEditRow = oModel.getProperty("/editRow") || {};

            var oSource = oEvent.getSource();
            var sId = oSource.getId();
            var bIsEdit = sId.includes("editMain");

            var sViewId = this.getView().getId();

            // Resolve input IDs explicitly
            var oQtyInput = bIsEdit
                ? this.byId("editMainQuantityInput")
                : sap.ui.getCore().byId(sViewId + "--mainQuantityInput");
            var oAmtInput = bIsEdit
                ? this.byId("editMainAmountPerUnitInput")
                : sap.ui.getCore().byId(sViewId + "--mainAmountPerUnitInput");
            var oProfitInput = bIsEdit
                ? this.byId("editMainProfitMarginInput")
                : sap.ui.getCore().byId(sViewId + "--mainProfitMarginInput");

            var iQuantity = parseFloat(oQtyInput?.getValue()) || 0;
            var iAmount = parseFloat(oAmtInput?.getValue()) || 0;
            var iProfitMargin = parseFloat(oProfitInput?.getValue()) || 0;

            console.log("Quantity Calculated:", iQuantity);
            console.log("amount :", iAmount);
            console.log("Profit Calculated:", iProfitMargin);

            var iTotal = iQuantity * iAmount;
            var amountPerUnitWithProfit = iProfitMargin
                ? (iAmount * (iProfitMargin / 100) + iAmount)
                //iAmount + (iAmount * iProfitMargin / 100)
                : 0;
            var totalWithProfit = iProfitMargin
                ? (iTotal * (iProfitMargin / 100) + iTotal)
                //iTotal + (iTotal * iProfitMargin / 100)
                : 0;

            console.log("Total Calculated:", iTotal);

            if (bIsEdit && oEditRow) {
                oEditRow.total = iTotal.toFixed(3);
                oEditRow.totalWithProfit = totalWithProfit.toFixed(3);
                oEditRow.amountPerUnitWithProfit = amountPerUnitWithProfit.toFixed(3);
                oModel.setProperty("/editRow", oEditRow);
            } else {
                oModel.setProperty("/Total", iTotal.toFixed(3));
                oModel.setProperty("/totalWithProfit", totalWithProfit.toFixed(3));
                oModel.setProperty("/amountPerUnitWithProfit", amountPerUnitWithProfit.toFixed(3));
            }
        },
        onFormulaSelected: function (oEvent) {
            var oSelect = oEvent.getSource();
            var sKey = oSelect.getSelectedKey();
            var oModel = this.getView().getModel();
            var aFormulas = oModel.getProperty("/Formulas") || [];

            var oFormula = aFormulas.find(f => f.formulaCode === sKey);
            oModel.setProperty("/SelectedFormula", oFormula || null);
            oModel.setProperty("/HasSelectedFormula", !!oFormula);

            // Enable or disable parameter button + quantity input
            var oQuantityInput = this.byId("mainQuantityInput");
            if (!oFormula) {
                oQuantityInput.setEditable(true);
                oQuantityInput.setValue("");
                oModel.setProperty("/IsFormulaBasedQuantity", false);
            } else {
                oQuantityInput.setEditable(false);
                oModel.setProperty("/IsFormulaBasedQuantity", true);
            }
        },
        onOpenFormulaDialog: function () {
            var oModel = this.getView().getModel();
            var oFormula = oModel.getProperty("/SelectedFormula");

            if (!oFormula) {
                sap.m.MessageToast.show("Please select a formula first.");
                return;
            }

            var oDialog = this.byId("formulaDialog");
            var oVBox = this.byId("formulaParamContainer");
            oVBox.removeAllItems();

            var oParams = {};
            oFormula.parameterIds.forEach(paramId => {
                oVBox.addItem(new sap.m.Label({ text: paramId }));
                var oInput = new sap.m.Input({
                    id: paramId,
                    placeholder: "Enter " + paramId,
                    liveChange: (oEvt) => {
                        oParams[paramId] = oEvt.getParameter("value");
                        oModel.setProperty("/FormulaParameters", oParams);
                    }
                });
                oVBox.addItem(oInput);
            });

            oDialog.open();
        },
        _calculateFormulaResult: function (oFormula, oParams) {
            if (!oFormula || !oParams) return 0;

            try {
                let expression = oFormula.formulaLogic; // e.g. "length * width + depth"
                oFormula.parameterIds.forEach(paramId => {
                    const value = parseFloat(oParams[paramId]) || 0;
                    expression = expression.replaceAll(paramId, value);
                });
                expression = expression.replace(/\^/g, "**");
                const result = Function('"use strict";return (' + expression + ')')();
                return parseFloat(result.toFixed(3));
            } catch (err) {
                console.error("Error evaluating formula:", err);
                sap.m.MessageToast.show("Invalid formula or parameters.");
                return 0;
            }
        },
        onFormulaDialogOK: function () {
            var oModel = this.getView().getModel();
            var oFormula = oModel.getProperty("/SelectedFormula");
            var oParams = oModel.getProperty("/FormulaParameters");
            var result = this._calculateFormulaResult(oFormula, oParams);

            this.byId("formulaDialog").close();

            var oQuantityInput = this.byId("mainQuantityInput");
            oQuantityInput.setValue(result);
            oModel.setProperty("/IsFormulaBasedQuantity", true);

            var amount = parseFloat(this.byId("mainAmountPerUnitInput").getValue()) || 0;
            var total = result * amount;
            this.byId("mainTotalInput").setValue(total.toFixed(3));
        },
        onInputChange: function () {
            var qty = parseFloat(this.byId("mainQuantityInput").getValue()) || 0;
            var price = parseFloat(this.byId("mainAmountPerUnitInput").getValue()) || 0;
            this.byId("mainTotalInput").setValue((qty * price).toFixed(3));
        },
        onOpenMainDialog: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/newModelService", { currencyCode: "SAR" }); // Default currency to SAR
            this.byId("addModelServiceDialog").open();
            // Pre-select SAR in the currency dropdown — find the UUID for SAR from loaded list
            const oCurrencySelect = this.byId("mainCurrencySelect");
            if (oCurrencySelect) {
                const aCurrencies = oModel.getProperty("/Currency") || [];
                const oSAR = aCurrencies.find(c =>
                    (c.code && c.code.toUpperCase() === "SAR") ||
                    (c.description && c.description.toLowerCase().includes("saudi"))
                );
                if (oSAR && oSAR.currencyCode) {
                    oCurrencySelect.setSelectedKey(oSAR.currencyCode);
                }
            }
        },
        onAddModelSpecDetails: async function () {
            const oView = this.getView();
            const oModel = oView.getModel("view");
            const modelSpecCode = this.currentModelSpecCode;
            if (!modelSpecCode) {
                sap.m.MessageBox.error("Model Specification Code not found! Cannot add detail.");
                return;
            }
            const aDetails = oModel.getProperty("/ModelServices") || [];
            const maxId = aDetails.length > 0 ? Math.max(...aDetails.map(d => parseInt(d.modelSpecDetailsCode) || 0)) : 0;
            const modelSpecDetailsCode = maxId + 1;  // Sequential integer, valid for Integer type
            const oServiceTypeSelect = oView.byId("mainServiceTypeSelect");
            const oMatGroupSelect = oView.byId("mainMatGroupSelect");
            const oPersonnelSelect = oView.byId("personnelNumber");
            const oLineTypeSelect = oView.byId("lineTypes");
            const oUOMSelect = oView.byId("mainUOMSelect");
            const oFormulaSelect = oView.byId("formulaSelect");
            const oCurrencySelect = oView.byId("mainCurrencySelect");
            var oPayload = {
                modelSpecDetailsCode: modelSpecDetailsCode,  // Integer
                serviceNumberCode: parseInt(oView.byId("mainModelServiceNoSelect").getSelectedKey()) || 0,
                noServiceNumber: 0,
                serviceTypeCode: oServiceTypeSelect && oServiceTypeSelect.getSelectedItem()
                    ? oServiceTypeSelect.getSelectedItem().getText()
                    : oModel.getProperty("/newModelService/serviceTypeCode") || "",
                materialGroupCode: oMatGroupSelect && oMatGroupSelect.getSelectedItem()
                    ? oMatGroupSelect.getSelectedItem().getText()
                    : oModel.getProperty("/newModelService/materialGroupCode") || "",
                personnelNumberCode: oPersonnelSelect && oPersonnelSelect.getSelectedItem()
                    ? oPersonnelSelect.getSelectedItem().getText()
                    : "",
                unitOfMeasurementCode: oUOMSelect && oUOMSelect.getSelectedItem()
                    ? oUOMSelect.getSelectedItem().getText()
                    : "",
                formulaCode: oFormulaSelect && oFormulaSelect.getSelectedItem()
                    ? oFormulaSelect.getSelectedItem().getText()
                    : "",
                currencyCode: oCurrencySelect && oCurrencySelect.getSelectedItem()
                    ? oCurrencySelect.getSelectedItem().getText()
                    : "",
                lineTypeCode: oLineTypeSelect && oLineTypeSelect.getSelectedItem()
                    ? oLineTypeSelect.getSelectedItem().getText()
                    : "",
                selectionCheckBox: true,
                lineIndex: "",
                shortText: oView.byId("mainShortTextInput").getValue() || "",
                quantity: parseFloat(oView.byId("mainQuantityInput").getValue()) || parseFloat(oModel.getProperty("/newModelService/quantity")) || 0,
                grossPrice: parseFloat(oView.byId("mainAmountPerUnitInput").getValue()) || parseFloat(oModel.getProperty("/newModelService/grossPrice")) || 0,
                overFulfilmentPercentage: parseFloat(oView.byId("mainOverFInput").getValue()) || parseFloat(oModel.getProperty("/newModelService/overFulfilmentPercentage")) || 0,
                priceChangedAllowed: oView.byId("mainPriceChangeAllowed").getSelected() || oModel.getProperty("/newModelService/priceChangedAllowed") || false,
                unlimitedOverFulfillment: oView.byId("mainUnlimitedOverF").getSelected() || oModel.getProperty("/newModelService/unlimitedOverFulfillment") || false,
                pricePerUnitOfMeasurement: parseFloat(oView.byId("mainPricePerUnitInput").getValue()) || parseFloat(oModel.getProperty("/newModelService/pricePerUnitOfMeasurement")) || 0,
                externalServiceNumber: oView.byId("mainExternalServiceNo").getValue() || oModel.getProperty("/newModelService/externalServiceNumber") || "",
                netValue: parseFloat(oView.byId("mainTotalInput").getValue()) || 0,
                serviceText: oView.byId("mainServiceText").getValue() || oModel.getProperty("/newModelService/serviceText") || "",
                lineText: oView.byId("mainLineText").getValue() || oModel.getProperty("/newModelService/lineText") || "",
                lineNumber: oView.byId("_IDGenInput6").getValue() || oModel.getProperty("/newModelService/lineNumber") || "",
                alternatives: oView.byId("_IDGenInput7").getValue() || oModel.getProperty("/newModelService/alternatives") || "",
                biddersLine: oView.byId("_IDGenCheckBox").getSelected() || oModel.getProperty("/newModelService/biddersLine") || false,
                supplementaryLine: oView.byId("_IDGenCheckBox2").getSelected() || oModel.getProperty("/newModelService/supplementaryLine") || false,
                lotSizeForCostingIsOne: oView.byId("_IDGenCheckBox6").getSelected() || oModel.getProperty("/newModelService/lotSizeForCostingIsOne") || false,
                lastChangeDate: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD
                modelSpecifications_modelSpecCode: parseInt(modelSpecCode), // Ensure numeric as per example
                serviceNumber_serviceNumberCode: oView.byId("mainModelServiceNoSelect").getSelectedKey() || ""
            };
            const sUrl = `./odata/v4/sales-cloud/ModelSpecifications(${modelSpecCode})/modelSpecificationsDetails`;
            try {
                const response = await fetch(sUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(oPayload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                sap.m.MessageToast.show("Model Specification Detail added successfully!");
                this._loadModelSpecificationDetails(modelSpecCode);

                const oDialog = oView.byId("addModelServiceDialog");
                if (oDialog) {
                    // Clear all fields for the next entry
                    oView.byId("mainModelServiceNoSelect").setSelectedKey("");
                    oView.byId("mainShortTextInput").setValue("");
                    oView.byId("mainShortTextInput").setEditable(true);
                    oView.byId("mainQuantityInput").setValue("");
                    oView.byId("mainAmountPerUnitInput").setValue("");
                    oView.byId("mainTotalInput").setValue("");
                    oView.byId("formulaSelect").setSelectedKey("");
                    oView.byId("mainUOMSelect").setSelectedKey("");
                    oView.byId("mainCurrencySelect").setSelectedKey("");
                    oView.byId("mainOverFInput").setValue("");
                    oView.byId("mainPriceChangeAllowed").setSelected(false);
                    oView.byId("mainUnlimitedOverF").setSelected(false);
                    oView.byId("mainPricePerUnitInput").setValue("");
                    oView.byId("mainMatGroupSelect").setSelectedKey("");
                    oView.byId("mainServiceTypeSelect").setSelectedKey("");
                    oView.byId("mainExternalServiceNo").setValue("");
                    oView.byId("mainServiceText").setValue("");
                    oView.byId("mainLineText").setValue("");
                    oView.byId("personnelNumber").setSelectedKey("");
                    oView.byId("lineTypes").setSelectedKey("");
                    oView.byId("_IDGenInput6").setValue("");
                    oView.byId("_IDGenInput7").setValue("");
                    oView.byId("_IDGenCheckBox").setSelected(false);
                    oView.byId("_IDGenCheckBox2").setSelected(false);
                    oView.byId("_IDGenCheckBox6").setSelected(false);
                    oModel.setProperty("/newModelService", {});
                    oModel.setProperty("/SelectedServiceNumber", "");
                    oModel.setProperty("/SelectedServiceNumberDescription", "");
                    oModel.setProperty("/HasSelectedFormula", false);
                    oModel.setProperty("/SelectedFormula", null);
                    oModel.setProperty("/IsFormulaBasedQuantity", false);
                    oDialog.close();
                }

            } catch (err) {
                console.error("Error adding Model Specification Detail:", err);
                sap.m.MessageBox.error("Failed to add Model Specification Detail: " + err.message);
            }
        },
        onDetails: function (oEvent) {
            var oContext = oEvent.getSource().getParent().getBindingContext();
            if (oContext) {
                var modelData = oContext.getProperty();
                //MessageToast.show("Details: " + modelData.line);

                var oModel = this.getView().getModel();
                oModel.setProperty("/selectedLine", modelData);

                var oDialog = this.getView().byId("detailsDialog");
                if (oDialog) {
                    oDialog.open();
                } else {
                    console.error("Details dialog not found");
                }

            }
        },
        onDelete: function (oEvent) {
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (!oBindingContext) {
                sap.m.MessageBox.error("Error: Could not determine the row to delete!");
                return;
            }

            var sPath = oBindingContext.getPath(); // e.g. "/ModelServices/2" or "/ModelServices/123"
            var oTable = this.getView().byId("modelServicesTable");
            // Use the same model the table is bound to (named or default)
            var oModel = oTable.getModel() || this.getView().getModel("view") || this.getView().getModel();

            var oItem = oModel.getProperty(sPath);
            if (!oItem) {
                sap.m.MessageBox.error("Error: Could not determine the row to delete!");
                return;
            }

            var sKey = oItem.modelSpecDetailsCode;
            if (sKey === undefined || sKey === null) {
                sap.m.MessageBox.error("Error: item has no modelSpecDetailsCode!");
                return;
            }

            sap.m.MessageBox.confirm("Are you sure you want to delete this record?", {
                title: "Confirm Deletion",
                icon: sap.m.MessageBox.Icon.WARNING,
                actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
                emphasizedAction: sap.m.MessageBox.Action.YES,
                onClose: async function (sAction) {
                    if (sAction !== sap.m.MessageBox.Action.YES) return;

                    try {
                        // Build proper OData key depending on key type
                        // If key is numeric -> no quotes; if string -> add quotes
                        var keyIsNumeric = !isNaN(Number(sKey));
                        var keySegment = keyIsNumeric ? sKey : `'${encodeURIComponent(String(sKey))}'`;
                        var sUrl = `./odata/v4/sales-cloud/ModelSpecificationsDetails(${keySegment})`;

                        // Optional: show busy indicator on table while deleting
                        oTable.setBusy(true);

                        const response = await fetch(sUrl, { method: "DELETE" });
                        oTable.setBusy(false);

                        if (!response.ok) {
                            var txt = await response.text().catch(() => response.statusText);
                            throw new Error("Failed to delete: " + (txt || response.statusText));
                        }

                        // Remove the item from the array by matching modelSpecDetailsCode (safe)
                        var aData = oModel.getProperty("/ModelServices") || [];
                        var iIndex = aData.findIndex(function (itm) {
                            // compare numbers and strings robustly
                            return String(itm.modelSpecDetailsCode) === String(sKey);
                        });

                        if (iIndex !== -1) {
                            aData.splice(iIndex, 1);
                            oModel.setProperty("/ModelServices", aData);
                        } else {
                            // fallback: try to remove by path if index extraction works
                            var lastSeg = sPath.substring(sPath.lastIndexOf("/") + 1);
                            var idx = parseInt(lastSeg);
                            if (!isNaN(idx) && aData[idx]) {
                                aData.splice(idx, 1);
                                oModel.setProperty("/ModelServices", aData);
                            } else {
                                console.warn("Could not find deleted row in local model to remove; consider reloading server data.");
                            }
                        }

                        sap.m.MessageToast.show("Record deleted successfully.");
                        // Update totals after deletion
                        this.updateTotalValue();

                    } catch (err) {
                        oTable.setBusy(false);
                        console.error("Error deleting record:", err);
                        sap.m.MessageBox.error("Error deleting record: " + err.message);
                    }
                }.bind(this)
            });
        }
        ,
        onPress() {
            this.getOwnerComponent().getRouter().navTo("addModel");
        },
        onOpenAddDialog: function () {
            console.log("Opening dialog");
            var oDialog = this.getView().byId("addServiceDialog");
            if (oDialog) {
                oDialog.open();
            } else {
                console.error("Dialog not found");
            }
        },
        _onEditFormulaSelected: function (oFormula, oContext) {
            const oModel = this.getView().getModel();
            const oData = oContext.getObject();

            // Example: open a dialog for entering parameters (like r = 5)
            const sParam = oFormula.parameterDescriptions[0];
            const oInput = new sap.m.Input({ placeholder: `Enter value for ${sParam}` });

            const oDialog = new sap.m.Dialog({
                title: "Enter Parameters",
                content: [oInput],
                beginButton: new sap.m.Button({
                    text: "OK",
                    press: () => {
                        const val = parseFloat(oInput.getValue());
                        if (isNaN(val)) {
                            sap.m.MessageToast.show("Please enter a valid number");
                            return;
                        }

                        // Example calculation using formula logic (replace this with real parser)
                        const result = (22 / 7) * (val * val); // for 22/7*r^2
                        oData.result = result;
                        oModel.refresh(true);
                        oDialog.close();
                    }
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: () => oDialog.close()
                })
            });

            oDialog.open();
        },
        onOpenEditFormulaDialog: function () {
            const oEditModel = this._oEditDialog.getModel("editModel"); // << correct model
            const sFormulaCode = oEditModel.getProperty("/formulaCode");  // << path in editModel

            if (!sFormulaCode) {
                sap.m.MessageToast.show("Please select a formula first.");
                return;
            }

            const oViewModel = this.getView().getModel(); // default model for master lists
            const aFormulas = oViewModel.getProperty("/Formulas") || [];
            const oFormula = aFormulas.find(f => f.formulaCode === sFormulaCode);

            if (!oFormula) {
                sap.m.MessageToast.show("Formula not found.");
                return;
            }

            // Create a VBox with dynamic parameter inputs
            const oVBox = new sap.m.VBox();
            oFormula.parameterDescriptions.forEach((desc, i) => {
                const paramId = oFormula.parameterIds[i];
                oVBox.addItem(new sap.m.Label({ text: desc }));
                oVBox.addItem(new sap.m.Input(this.createId("editParam_" + paramId), {
                    placeholder: `Enter ${desc}`
                }));
            });

            // Dialog for parameters
            const oDialog = new sap.m.Dialog({
                title: "Enter Formula Parameters",
                content: [oVBox],
                beginButton: new sap.m.Button({
                    text: "OK",
                    type: "Emphasized",
                    press: () => {
                        const oParams = {};
                        oFormula.parameterIds.forEach(paramId => {
                            oParams[paramId] = this.byId("editParam_" + paramId).getValue();
                        });

                        const result = this._calculateFormulaResult(oFormula, oParams);
                        oEditModel.setProperty("/quantity", result); // update quantity
                        sap.m.MessageToast.show("Quantity updated to " + result);
                        oDialog.close();
                    }
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: () => oDialog.close()
                })
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        }
        ,
        onEditModelSpecDetails: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext();

            if (!oContext) {
                sap.m.MessageToast.show("No data found for editing.");
                return;
            }

            var oSelectedData = oContext.getObject();
            var oView = this.getView();

            if (!this._oEditDialog) {
                this._oEditDialog = new sap.m.Dialog({
                    title: "Edit Model Service",
                    contentWidth: "800px",
                    contentHeight: "80%",
                    resizable: true,
                    draggable: true,
                    content: new sap.ui.layout.form.SimpleForm({
                        editable: true,
                        layout: "ResponsiveGridLayout",
                        class: "sapUiSmallMargin",
                        content: [
                            new sap.m.Label({ text: "Service.No" }),
                            new sap.m.Input({ value: "{editModel>/serviceNumberCode}" }),

                            new sap.m.Label({ text: "Short Text" }),
                            new sap.m.Input({ value: "{editModel>/shortText}" }),

                            new sap.m.Label({ text: "Quantity" }),
                            new sap.m.Input({
                                id: "qtyInput",  // Added ID for stable reference in onEditInputChange
                                type: "Number", value: "{editModel>/quantity}", liveChange: this.onEditInputChange.bind(this), valueLiveUpdate: true
                            }),

                            new sap.m.Label({ text: "Gross Price" }),
                            new sap.m.Input({
                                id: "grossPriceInput", 
                                type: "Number", value: "{editModel>/grossPrice}", liveChange: this.onEditInputChange.bind(this), valueLiveUpdate: true
                            }),

                            new sap.m.Label({ text: "Net Value" }),
                            new sap.m.Input({ type: "Number", value: "{editModel>/netValue}", editable: false }),

                            new sap.m.Label({ text: "Formula" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/formulaCode}",
                                change: function (oEvent) {
                                    var oModel = this._oEditDialog.getModel("editModel");
                                    var oSelectedItem = oEvent.getParameter("selectedItem");
                                    // Store description text (same as what DB holds)
                                    var text = oSelectedItem ? oSelectedItem.getText() : "";
                                    oModel.setProperty("/formulaCode", text);
                                }.bind(this),
                                items: { path: "/Formulas", template: new sap.ui.core.Item({ key: "{description}", text: "{description}" }) }
                            }),
                            new sap.m.Button({
                                text: "Enter Parameters", press: this.onOpenEditFormulaDialog.bind(this)
                                ,
                                //enabled: "{/HasSelectedFormula}"
                            }),

                            new sap.m.Label({ text: "UOM" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/unitOfMeasurementCode}",
                                change: function (oEvent) {
                                    var oModel = this._oEditDialog.getModel("editModel");
                                    var oSelectedItem = oEvent.getParameter("selectedItem");
                                    // Store description text (same as what DB holds)
                                    var text = oSelectedItem ? oSelectedItem.getText() : "";
                                    oModel.setProperty("/unitOfMeasurementCode", text);
                                }.bind(this),
                                items: { path: "/UOM", template: new sap.ui.core.Item({ key: "{description}", text: "{description}" }) }
                            }),
                            new sap.m.Label({ text: "Currency" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/currencyCode}",
                                change: function (oEvent) {
                                    var oModel = this._oEditDialog.getModel("editModel");
                                    var oSelectedItem = oEvent.getParameter("selectedItem");
                                    // Store description text (same as what DB holds)
                                    var text = oSelectedItem ? oSelectedItem.getText() : "";
                                    oModel.setProperty("/currencyCode", text);
                                }.bind(this),
                                items: { path: "/Currency", template: new sap.ui.core.Item({ key: "{description}", text: "{description}" }) }
                            }),
                            new sap.m.Label({ text: "OverF.Percentage" }),
                            new sap.m.Input({ type: "Number", value: "{editModel>/overFulfilmentPercentage}" }),

                            new sap.m.Label({ text: "Price Change Allowed" }),
                            new sap.m.CheckBox({ selected: "{editModel>/priceChangedAllowed}" }),

                            new sap.m.Label({ text: "Unlimited OverFulfillment" }),
                            new sap.m.CheckBox({ selected: "{editModel>/unlimitedOverFulfillment}" }),

                            new sap.m.Label({ text: "Price Per Unit Of Measurement" }),
                            new sap.m.Input({ type: "Number", value: "{editModel>/pricePerUnitOfMeasurement}" }),

                            new sap.m.Label({ text: "Mat Group" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/materialGroupCode}",
                                items: { path: "/MatGroups", template: new sap.ui.core.Item({ key: "{materialGroupCode}", text: "{description}" }) }
                            }),

                            new sap.m.Label({ text: "Service Type" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/serviceTypeCode}",
                                items: { path: "/ServiceTypes", template: new sap.ui.core.Item({ key: "{serviceTypeCode}", text: "{description}" }) }
                            }),

                            new sap.m.Label({ text: "External Service No" }),
                            new sap.m.Input({ value: "{editModel>/externalServiceNumber}" }),

                            new sap.m.Label({ text: "Service Text" }),
                            new sap.m.Input({ value: "{editModel>/serviceText}" }),

                            new sap.m.Label({ text: "Line Text" }),
                            new sap.m.Input({ value: "{editModel>/lineText}" }),

                            new sap.m.Label({ text: "Personnel Number" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/personnelNumberCode}",
                                items: { path: "/personnelNumbers", template: new sap.ui.core.Item({ key: "{personnelNumberCode}", text: "{description}" }) }
                            }),

                            new sap.m.Label({ text: "Line Types" }),
                            new sap.m.Select({
                                selectedKey: "{editModel>/lineTypeCode}",
                                items: { path: "/LineTypes", template: new sap.ui.core.Item({ key: "{lineTypeCode}", text: "{description}" }) }
                            }),

                            new sap.m.Label({ text: "Line Number" }),
                            new sap.m.Input({ value: "{editModel>/lineNumber}" }),

                            new sap.m.Label({ text: "Alt" }),
                            new sap.m.Input({ value: "{editModel>/alternatives}" }),

                            new sap.m.Label({ text: "Bidder's Line" }),
                            new sap.m.CheckBox({ selected: "{editModel>/biddersLine}" }),

                            new sap.m.Label({ text: "Supp.Line" }),
                            new sap.m.CheckBox({ selected: "{editModel>/supplementaryLine}" }),

                            new sap.m.Label({ text: "Cstg_Ls" }),
                            new sap.m.CheckBox({ selected: "{editModel>/lotSizeForCostingIsOne}" })
                        ]
                    }),
                    buttons: [
                        new sap.m.Button({
                            text: "Save",
                            type: "Emphasized",
                            press: this.onSaveEditModelService.bind(this)
                        }),
                        new sap.m.Button({
                            text: "Cancel",
                            press: function () {
                                this._oEditDialog.close();
                            }.bind(this)
                        })
                    ]
                });
                oView.addDependent(this._oEditDialog);
            }
            var oViewModel = oView.getModel();
            if (oViewModel) {
                this._oEditDialog.setModel(oViewModel);
            }
            var oEditModelData = Object.assign({}, oSelectedData);
            var oEditModel = new sap.ui.model.json.JSONModel(oEditModelData);
            this._oEditDialog.setModel(oEditModel, "editModel");
            this._oEditDialog.open();
        },
        onSaveEditModelService: async function () {
            var oDialog = this._oEditDialog;
            var oData = oDialog.getModel("editModel").getData();

            console.log('Saving data - Formula:', oData.formulaCode, 'UOM:', oData.unitOfMeasurementCode, 'Currency:', oData.currencyCode);

            if (!oData || !oData.modelSpecDetailsCode) {
                sap.m.MessageBox.warning("Missing Model Spec Details Code.");
                return;
            }

            try {
                // Remove virtual-only fields before sending PATCH.
                // unitOfMeasurementCode / currencyCode / formulaCode already hold description
                // text (the edit dialog selects now use description as key, matching DB storage).
                const { currencyDescription, unitOfMeasurementDescription, formulaDescription, ...payload } = oData;

                // --- API PATCH ---
                const response = await fetch(
                    `./odata/v4/sales-cloud/ModelSpecificationsDetails(${oData.modelSpecDetailsCode})`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    }
                );

                if (!response.ok) {
                    throw new Error(`Failed to update: ${response.statusText}`);
                }

                // --- Update table model locally ---
                var oTableModel = this.getView().getModel();
                var aRows = oTableModel.getProperty("/ModelServices");
                var oRow = aRows.find(r => r.modelSpecDetailsCode === oData.modelSpecDetailsCode);

                if (oRow) {
                    // unitOfMeasurementCode / currencyCode / formulaCode in oData already
                    // hold description text — just copy straight across.
                    oRow.unitOfMeasurementCode        = oData.unitOfMeasurementCode;
                    oRow.unitOfMeasurementDescription = oData.unitOfMeasurementCode;
                    oRow.currencyCode                 = oData.currencyCode;
                    oRow.currencyDescription          = oData.currencyCode;
                    oRow.formulaCode                  = oData.formulaCode;
                    oRow.formulaDescription           = oData.formulaCode;

                    // Copy remaining edited fields
                    Object.assign(oRow, payload);
                }

                oTableModel.refresh(true);

                // Recalculate totals if needed
                this.updateTotalValue();

                sap.m.MessageToast.show("Model Specification updated successfully!");
                oDialog.close();

            } catch (error) {
                sap.m.MessageBox.error("Error updating Model Specification: " + error.message);
            }
        }
        ,
        onEditInputChange: function (oEvent) {
            const oEditModel = this._oEditDialog.getModel("editModel");
            if (!oEditModel) return;

            const oSource = oEvent.getSource();
            const sPath = oSource.getBinding("value").getPath();

            // Get current values directly from the model
            const quantity = parseFloat(oEditModel.getProperty("/quantity")) || 0;
            const grossPrice = parseFloat(oEditModel.getProperty("/grossPrice")) || 0;

            // Compute new net value
            const netValue = quantity * grossPrice;

            // Update the model
            oEditModel.setProperty("/netValue", netValue);
        }
        ,
        onCloseEditDialog: function () {
            this.byId("editModelServiceDialog").close();
        },
        _openExcelUploadDialogModelSpec: function () {
            var that = this;
            var selectedFile;

            var oFileUploader = new sap.ui.unified.FileUploader({
                width: "100%",
                fileType: ["xls", "xlsx"],
                sameFilenameAllowed: true,
                change: function (oEvent) {
                    selectedFile = oEvent.getParameter("files")[0];
                }
            });

            var oDialogContent = new sap.m.VBox({ items: [oFileUploader] });
            var oExcelTable;

            var oExcelDialog = new sap.m.Dialog({
                title: "Import Model Spec from Excel",
                contentWidth: "80%",
                contentHeight: "70%",
                content: [oDialogContent],
                buttons: [
                    new sap.m.Button({
                        text: "Add Selected",
                        type: "Emphasized",
                        press: async function () {
                            const oView = that.getView();
                            const oModel = oView.getModel("view");
                            const modelSpecCode = that.currentModelSpecCode;
                            if (!modelSpecCode) {
                                sap.m.MessageBox.error("Model Specification Code not found!");
                                return;
                            }

                            const aDetails = oModel.getProperty("/ModelServices") || [];

                            // Filter selected rows
                            const aSelectedRows = oExcelTable.getModel().getProperty("/rows").filter(r => r.selected);
                            if (aSelectedRows.length === 0) {
                                sap.m.MessageToast.show("Please select at least one row!");
                                return;
                            }

                            let maxId = aDetails.length > 0 ? Math.max(...aDetails.map(d => parseInt(d.modelSpecDetailsCode) || 0)) : 0;

                            for (const row of aSelectedRows) {
                                maxId += 1;

                                const oPayload = {
                                    modelSpecDetailsCode: maxId,
                                    serviceNumberCode: parseInt(row.serviceNumberCode) || 0,
                                    noServiceNumber: 0,
                                    serviceTypeCode: row.serviceTypeCode || "",
                                    materialGroupCode: row.materialGroupCode || "",
                                    personnelNumberCode: row.personnelNumberCode || "",
                                    unitOfMeasurementCode: row.unitOfMeasurementCode || "",
                                    formulaCode: row.formulaCode || "",
                                    currencyCode: row.currencyCode || "",
                                    lineTypeCode: row.lineTypeCode || "",
                                    selectionCheckBox: true,
                                    lineIndex: "",
                                    shortText: row.shortText || "",
                                    quantity: parseFloat(row.quantity) || 0,
                                    grossPrice: parseFloat(row.grossPrice) || 0,
                                    overFulfilmentPercentage: parseFloat(row.overFulfilmentPercentage) || 0,
                                    priceChangedAllowed: row.priceChangedAllowed || false,
                                    unlimitedOverFulfillment: row.unlimitedOverFulfillment || false,
                                    pricePerUnitOfMeasurement: parseFloat(row.pricePerUnitOfMeasurement) || 0,
                                    externalServiceNumber: row.externalServiceNumber || "",
                                    netValue: parseFloat(row.quantity * row.grossPrice) || 0,
                                    serviceText: row.serviceText || "",
                                    lineText: row.lineText || "",
                                    lineNumber: row.lineNumber || "",
                                    alternatives: row.alternatives || "",
                                    biddersLine: row.biddersLine ? true : null,
                                    supplementaryLine: row.supplementaryLine ? true : null,
                                    lotSizeForCostingIsOne: row.lotCostOne ? true : null,

                                    lastChangeDate: new Date().toISOString().split("T")[0],
                                    modelSpecifications_modelSpecCode: parseInt(modelSpecCode),
                                    serviceNumber_serviceNumberCode: row.serviceNumberCode || ""
                                };

                                // Post to API
                                const sUrl = `./odata/v4/sales-cloud/ModelSpecifications(${modelSpecCode})/modelSpecificationsDetails`;
                                try {
                                    const response = await fetch(sUrl, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(oPayload)
                                    });
                                    if (!response.ok) {
                                        const errorText = await response.text();
                                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                                    }
                                    aDetails.push(oPayload);
                                } catch (err) {
                                    console.error("Error adding row:", err);
                                    sap.m.MessageToast.show("Failed to add a row: " + err.message);
                                }
                            }

                            // Update model and total
                            oModel.setProperty("/ModelServices", aDetails);
                            const total = aDetails.reduce((sum, rec) => sum + (parseFloat(rec.netValue) || 0), 0);
                            oModel.setProperty("/Total", total);
                            that.getView().byId("modelServicesTable").getModel().refresh(true);

                            sap.m.MessageToast.show("Selected rows added successfully!");
                            oExcelDialog.close();
                        }
                    }),
                    new sap.m.Button({
                        text: "Add All",
                        press: function () {
                            // Select all rows
                            const allRows = oExcelTable.getModel().getProperty("/rows");
                            allRows.forEach(r => r.selected = true);
                            oExcelTable.getModel().refresh();
                            // Call "Add Selected" button
                            oExcelDialog.getButtons()[0].firePress();
                        }
                    }),
                    new sap.m.Button({
                        text: "Cancel",
                        press: function () {
                            oExcelDialog.close();
                        }
                    })
                ]
            });

            // Handle file reading
            var handleFileRead = function () {
                if (!selectedFile) return;

                var reader = new FileReader();
                reader.onload = function (e) {
                    var data = new Uint8Array(e.target.result);
                    var workbook = XLSX.read(data, { type: "array" });
                    var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    var jsonData = XLSX.utils.sheet_to_json(firstSheet);

                    jsonData.forEach(r => r.selected = false); // Add checkbox property
                    var oExcelDataModel = new sap.ui.model.json.JSONModel({ rows: jsonData });

                    oExcelTable = new sap.m.Table({
                        width: "100%",
                        columns: [
                            new sap.m.Column({ header: new sap.m.Text({ text: "Select" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Service Number" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Short Text" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Quantity" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Gross Price" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Currency" }) })
                        ]
                    });

                    oExcelTable.setModel(oExcelDataModel);

                    oExcelTable.bindItems({
                        path: "/rows",
                        template: new sap.m.ColumnListItem({
                            type: "Inactive",
                            cells: [
                                new sap.m.CheckBox({ selected: "{selected}", select: function () { oExcelTable.getModel().refresh(); } }),
                                new sap.m.Text({ text: "{serviceNumberCode}" }),
                                new sap.m.Text({ text: "{shortText}" }),
                                new sap.m.Text({ text: "{quantity}" }),
                                new sap.m.Text({ text: "{grossPrice}" }),
                                new sap.m.Text({ text: "{currencyCode}" })
                            ]
                        })
                    });

                    oDialogContent.addItem(oExcelTable);
                };
                reader.readAsArrayBuffer(selectedFile);
            };

            oFileUploader.attachChange(handleFileRead);
            oExcelDialog.open();
        },
        onCloseDialog: function () {
            var oDialog = this.getView().byId("addModelServiceDialog");
            if (oDialog) {
                oDialog.close();
                this.getView().byId("dialogLine").setValue("");
                this.getView().byId("dialogServiceNo").setValue("");
                this.getView().byId("dialogShortText").setValue("");
                this.getView().byId("dialogQuantity").setValue("");
                this.getView().byId("dialogFormula").setValue("");
                this.getView().byId("dialogFormulaParameters").setValue("");
                this.getView().byId("dialogGrossPrice").setValue("");
                this.getView().byId("dialogNetValue").setValue("");
                this.getView().byId("dialogUnitOfMeasure").setValue("");
                this.getView().byId("dialogCrcy").setValue("");
                this.getView().byId("dialogOverFPercentage").setValue("");
                this.getView().byId("dialogPriceChangeAllowed").setValue("");
                this.getView().byId("dialogUnlimitedOverF").setValue("");
                this.getView().byId("dialogPricePerUnitOfMeasurement").setValue("");
                this.getView().byId("dialogMatGroup").setValue("");
                this.getView().byId("dialogServiceType").setValue("");
                this.getView().byId("dialogExternalServiceNo").setValue("");
                this.getView().byId("dialogServiceText").setValue("");
                this.getView().byId("dialogLineText").setValue("");
                this.getView().byId("dialogPersonnelNumber").setValue("");
                this.getView().byId("dialogLineType").setValue("");
                this.getView().byId("dialogLineNumber").setValue("");
                this.getView().byId("dialogAlt").setValue("");
                this.getView().byId("dialogBiddersLine").setValue("");
                this.getView().byId("dialogSuppLine").setValue("");
                this.getView().byId("dialogCstgLs").setValue("");
            }
        },
        onChangeFilterLine: function (oEvent) {
            var oModel = this.getView().getModel();
            var filterValue = oEvent.getParameter("value");

            if (filterValue) {
                // Filter the original models based on the line value
                var filteredModels = oModel.getProperty("/originalModels").filter(function (model) {
                    return model.line.toLowerCase().includes(filterValue.toLowerCase());
                });
                oModel.setProperty("/Models", filteredModels);
            } else {
                // Reset to original models when input is empty
                oModel.setProperty("/Models", oModel.getProperty("/originalModels"));
            }
            //  MessageToast.show("Filtered by Line: " + (filterValue || "All"));
        },
        onSearchModelServices: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue");
            const oTable = this.byId("modelServicesTable");
            const oBinding = oTable.getBinding("rows"); // For sap.ui.table.Table

            if (!oBinding) {
                console.warn("No binding found for table rows.");
                return;
            }

            if (sQuery && sQuery.trim().length > 0) {
                const aFilters = [];

                // String field: shortText (Contains for partial match)
                aFilters.push(
                    new sap.ui.model.Filter("shortText", sap.ui.model.FilterOperator.Contains, sQuery)
                );

                // Numeric field: serviceNumberCode (EQ for exact match; parse query to number)
                const iServiceNumQuery = parseInt(sQuery, 10);
                if (!isNaN(iServiceNumQuery)) {
                    aFilters.push(
                        new sap.ui.model.Filter("serviceNumberCode", sap.ui.model.FilterOperator.EQ, iServiceNumQuery)
                    );
                } else {
                    console.log("Query not numeric; skipping serviceNumberCode filter:", sQuery);
                }

                // Example for another numeric field: lineNumber (uncomment if needed)
                // const iLineNumQuery = parseInt(sQuery, 10);
                // if (!isNaN(iLineNumQuery)) {
                //     aFilters.push(
                //         new sap.ui.model.Filter("lineNumber", sap.ui.model.FilterOperator.EQ, iLineNumQuery)
                //     );
                // }

                // Add more fields as needed (e.g., for other strings: Contains; numbers: EQ)

                if (aFilters.length > 0) {
                    const oFilter = new sap.ui.model.Filter({
                        filters: aFilters,
                        and: false  // OR logic: match any field
                    });
                    oBinding.filter(oFilter);
                    console.log("Applied filter:", oFilter);  // Debug
                } else {
                    oBinding.filter([]);  // No valid filters
                }
            } else {
                // Clear filters
                oBinding.filter([]);
                console.log("Cleared filters (empty query).");
            }
        },
        onExportToExcel: function () {
            var oTable = this.byId("modelServicesTable"); // your table
            var oModel = this.getView().getModel();

            // build column config (headers + property bindings)
            var aCols = [
                { label: "line", property: "line" },
                { label: "serviceNo", property: "serviceNo" },
                { label: "shortText", property: "shortText" },
                { label: "quantity", property: "quantity" },
                { label: "formula", property: "formula" },
                { label: "formulaParameters", property: "formulaParameters" },
                { label: "grossPrice", property: "grossPrice" },
                { label: "netValue", property: "netValue" },
                { label: "unitOfMeasure", property: "unitOfMeasure" },
                { label: "crcy", property: "crcy" },
                { label: "overFPercentage", property: "overFPercentage" },
                { label: "priceChangeAllowed", property: "priceChangeAllowed" },
                { label: "unlimitedOverF", property: "unlimitedOverF" },
                { label: "pricePerUnitOfMeasurement", property: "pricePerUnitOfMeasurement" },
                { label: "matGroup", property: "matGroup" },
                { label: "serviceType", property: "serviceType" },
                { label: "externalServiceNo", property: "externalServiceNo" },
                { label: "serviceText", property: "serviceText" },
                { label: "lineText", property: "lineText" },
                { label: "personnelNumber", property: "personnelNumber" },
                { label: "lineType", property: "lineType" },
                { label: "lineNumber", property: "lineNumber" },
                { label: "alt", property: "alt" },
                { label: "biddersLine", property: "biddersLine" },
                { label: "suppLine", property: "suppLine" },
                { label: "cstgLs", property: "cstgLs" }
            ];

            // data source (your model path)
            var oSettings = {
                workbook: { columns: aCols },
                dataSource: oModel.getProperty("/ModelServices"), // Fixed to /ModelServices
                fileName: "ModelServices.xlsx"
            };

            var oSpreadsheet = new sap.ui.export.Spreadsheet(oSettings);
            oSpreadsheet.build().finally(function () {
                oSpreadsheet.destroy();
            });
        },
        onImport: function () {
            var that = this;
            var oFileUploader = document.createElement("input");
            oFileUploader.type = "file";
            oFileUploader.accept = ".xlsx, .xls";
            oFileUploader.style.display = "none";

            oFileUploader.addEventListener("change", function (event) {
                var file = event.target.files[0];
                if (!file) {
                    sap.m.MessageToast.show("No file selected!");
                    return;
                }

                var reader = new FileReader();
                reader.onload = function (e) {
                    var data = new Uint8Array(e.target.result);
                    var workbook = XLSX.read(data, { type: "array" });

                    var firstSheet = workbook.SheetNames[0];
                    var worksheet = workbook.Sheets[firstSheet];

                    var excelData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    console.log(excelData);
                    var mappedData = excelData.map(function (row) {
                        return {
                            line: row.line || "",
                            serviceNo: row.serviceNo || "",
                            shortText: row.shortText || "",
                            quantity: row.quantity || "",
                            formula: row.formula || "",
                            formulaParameters: row.formulaParameters || "",
                            grossPrice: row.grossPrice || "",
                            netValue: row.netValue || "",
                            unitOfMeasure: row.unitOfMeasure || "",
                            crcy: row.crcy || "",
                            overFPercentage: row.overFPercentage || "",
                            priceChangeAllowed: row.priceChangeAllowed || "",
                            unlimitedOverF: row.unlimitedOverF || "",
                            pricePerUnitOfMeasurement: row.pricePerUnitOfMeasurement || "",
                            matGroup: row.matGroup || "",
                            serviceType: row.serviceType || "",
                            externalServiceNo: row.externalServiceNo || "",
                            serviceText: row.serviceText || "",
                            lineText: row.lineText || "",
                            personnelNumber: row.personnelNumber || "",
                            lineType: row.lineType || "",
                            lineNumber: row.lineNumber || "",
                            alt: row.alt || "",
                            biddersLine: row.biddersLine || "",
                            suppLine: row.suppLine || "",
                            cstgLs: row.cstgLs || ""
                        };
                    });
                    console.log(mappedData);

                    var oModel = that.getView().getModel();

                    var existingData = oModel.getProperty("/ModelServices") || []; // Fixed to /ModelServices

                    var mergedData = existingData.concat(mappedData);

                    oModel.setProperty("/ModelServices", mergedData);

                    sap.m.MessageToast.show("Excel records imported and appended successfully!");
                };
                reader.readAsArrayBuffer(file);
            });

            oFileUploader.click();
        }
    });
});