sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/layout/form/ResponsiveGridLayout"
], (Controller, JSONModel, Dialog, Button, Input, Label, VBox, MessageToast, MessageBox, SimpleForm, ResponsiveGridLayout) => {
    "use strict";

    return Controller.extend("tendering.controller.Tendering", {

        onInit: function () {
            // ── Main application model ──────────────────────────────────────────
            var oModel = new sap.ui.model.json.JSONModel({
                totalValue: 0,
                docNumber: "",
                importReady: false,
                importRows: [],
                itemNumber: "",
                MainItems: [],
                Formulas: [],
                Currency: [],
                UOM: [],
                Total: 0,
                SubTotal: 0,
                IsFormulaBasedQuantity: false,
                ServiceNumbers: [],
                SelectedServiceNumber: "",
                SelectedSubServiceNumber: "",
                SelectedServiceNumberDescription: "",
                SelectedSubDescription: "",
                SelectedSubDescriptionText: "",
                SubDescriptionEditable: true,
                SelectedFormula: null,
                totalWithProfit: 0,
                amountPerUnitWithProfit: 0,
                SelectedSubFormula: null,
                HasSelectedFormula: false,
                HasSelectedSubFormula: false,
                FormulaParameters: {},
                SubFormulaParameters: {}
            });
            this.getView().setModel(oModel);

            // ── Cost / Simulation model ─────────────────────────────────────────
            // Mirrors the "viewModel" from the reference mainPage app.
            // Holds all state for the Cost dialog (category data, totals, button state).
            var oCostModel = new sap.ui.model.json.JSONModel({
                costButtonEnabled: false,         // enabled when ≥1 row selected
                selectedCostCategory: "EAndD",    // active category in the cost dialog
                selectedItemDescription: "",      // description of first selected item
                totalAmount: "0.00",              // running total across all cost rows
                // Per-category data arrays
                simulationData:  [],  // EAndD rows
                indirectCostData: [], // IndirectCost rows
                materialData:    [],  // Material rows
                cablesData:      []   // Cables rows
            });
            this.getView().setModel(oCostModel, "costModel");

            // ── Routing ────────────────────────────────────────────────────────
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("tendering").attachPatternMatched(this._onRouteMatched, this);

            // ── Reference data fetches ──────────────────────────────────────────
            fetch("/odata/v4/sales-cloud/ServiceNumbers")
                .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
                .then(data => {
                    if (data && data.value) {
                        oModel.setProperty("/ServiceNumbers", data.value.map(i => ({
                            serviceNumberCode: i.serviceNumberCode,
                            description: i.description
                        })));
                    }
                })
                .catch(err => console.error("Error fetching ServiceNumbers:", err));

            fetch("/odata/v4/sales-cloud/Formulas")
                .then(r => r.json())
                .then(data => { oModel.setProperty("/Formulas", Array.isArray(data.value) ? data.value : []); oModel.refresh(true); })
                .catch(err => { console.error("Error fetching Formulas:", err); MessageToast.show("Failed to load formulas."); });

            fetch("/odata/v4/sales-cloud/UnitOfMeasurements")
                .then(r => r.json())
                .then(data => { oModel.setProperty("/UOM", Array.isArray(data.value) ? data.value : []); oModel.refresh(true); });

            fetch("/odata/v4/sales-cloud/Currencies")
                .then(r => r.json())
                .then(function(data) {
                    var currency = Array.isArray(data.value) ? data.value : [];
                    oModel.setProperty("/Currency", currency);
                    // Cache the SAR currency UUID so dialog-open handlers can use it
                    var sarItem = currency.find(function (c) { return c.code === "SAR"; });
                    this._sarCurrencyKey = sarItem ? sarItem.currencyCode : "";
                    oModel.refresh(true);
                }.bind(this));
        },

        _onRouteMatched: function (oEvent) {
            var oModel = this.getView().getModel();
            var args = oEvent.getParameter("arguments");
            oModel.setProperty("/docNumber", args.docNumber);
            oModel.setProperty("/itemNumber", args.itemNumber);

            fetch("/odata/v4/sales-cloud/getInvoiceMainItemByReferenceIdAndItemNumber", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ referenceId: args.docNumber, salesQuotationItem: args.itemNumber })
            })
                .then(r => r.json())
                .then(data => {
                    const mainItems = Array.isArray(data.value) ? data.value.map(item => ({
                        ...item,
                        subItemList: Array.isArray(item.subItemList) ? item.subItemList : []
                    })) : [];
                    const totalValue = mainItems.reduce((sum, r) => sum + Number(r.totalWithProfit || r.total || 0), 0);
                    oModel.setProperty("/MainItems", mainItems);
                    oModel.setProperty("/totalValue", totalValue);
                    this.getView().byId("treeTable").setModel(oModel);
                })
                .catch(err => console.error("Error fetching MainItems:", err));
        },

        // ─── CORE CALCULATION ─────────────────────────────────────────────────
        _applyProfitToItem: function (oItem) {
            const qty = parseFloat(oItem.quantity) || 0;
            const amt = parseFloat(oItem.amountPerUnit) || 0;
            const pm  = parseFloat(oItem.profitMargin) || 0;
            const total = qty * amt;
            oItem.total = total.toFixed(3);
            if (pm > 0) {
                oItem.totalWithProfit = (total + total * (pm / 100)).toFixed(3);
                oItem.amountPerUnitWithProfit = (amt + amt * (pm / 100)).toFixed(3);
            } else {
                oItem.totalWithProfit = total.toFixed(3);
                oItem.amountPerUnitWithProfit = amt.toFixed(3);
            }
        },

        _recalculateTotalValue: function () {
            const oModel = this.getView().getModel();
            const items = oModel.getProperty("/MainItems") || [];
            const total = items.reduce((sum, i) => sum + parseFloat(i.totalWithProfit || i.total || 0), 0);
            oModel.setProperty("/totalValue", total);
        },

        _recalculateMainFromSubitems: function (oMainItem) {
            if (!oMainItem || !Array.isArray(oMainItem.subItemList)) return;
            const totalSubs = oMainItem.subItemList.reduce((sum, sub) => sum + (parseFloat(sub.total) || 0), 0);
            oMainItem.amountPerUnit = totalSubs.toFixed(3);
            this._applyProfitToItem(oMainItem);
        },

        // ─── ROW SELECTION ────────────────────────────────────────────────────
        // Fires when the tree table selection changes.
        // Enables / disables the Cost button via the costModel.
        onRowSelectionChange: function () {
            var oTable = this.byId("treeTable");
            var aSelected = oTable.getSelectedIndices().filter(function (i) { return i >= 0; });
            this.getView().getModel("costModel").setProperty("/costButtonEnabled", aSelected.length > 0);
        },

        // ─── INPUT CHANGE ─────────────────────────────────────────────────────
        onInputChange: function (oEvent) {
            var oModel = this.getView().getModel();
            var sId = oEvent.getSource().getId();
            var bIsEdit = sId.includes("editMain");
            var sViewId = this.getView().getId();

            var oQtyInput    = bIsEdit ? this.byId("editMainQuantityInput")    : sap.ui.getCore().byId(sViewId + "--mainQuantityInput");
            var oAmtInput    = bIsEdit ? this.byId("editMainAmountPerUnitInput") : sap.ui.getCore().byId(sViewId + "--mainAmountPerUnitInput");
            var oProfitInput = bIsEdit ? this.byId("editMainProfitMarginInput") : sap.ui.getCore().byId(sViewId + "--mainProfitMarginInput");

            var qty   = parseFloat(oQtyInput ? oQtyInput.getValue() : 0) || 0;
            var amt   = parseFloat(oAmtInput ? oAmtInput.getValue() : 0) || 0;
            var pm    = parseFloat(oProfitInput ? oProfitInput.getValue() : 0) || 0;
            var total = qty * amt;
            var amtWithProfit   = pm > 0 ? (amt + amt * (pm / 100)) : amt;
            var totalWithProfit = pm > 0 ? (total + total * (pm / 100)) : total;

            if (bIsEdit) {
                var oEditRow = oModel.getProperty("/editRow") || {};
                oEditRow.total = total.toFixed(3);
                oEditRow.totalWithProfit = totalWithProfit.toFixed(3);
                oEditRow.amountPerUnitWithProfit = amtWithProfit.toFixed(3);
                oModel.setProperty("/editRow", oEditRow);
            } else {
                oModel.setProperty("/Total", total.toFixed(3));
                oModel.setProperty("/totalWithProfit", totalWithProfit.toFixed(3));
                oModel.setProperty("/amountPerUnitWithProfit", amtWithProfit.toFixed(3));
            }
        },

        onSubInputChange: function () {
            var qty = parseFloat(this.byId("subQuantityInput").getValue()) || 0;
            var amt = parseFloat(this.byId("subAmountPerUnitInput").getValue()) || 0;
            this.getView().getModel().setProperty("/SubTotal", (qty * amt).toFixed(3));
        },

        // ─── SERVICE NUMBER CHANGE ────────────────────────────────────────────
        onServiceNumberChange: function (oEvent) {
            var oSel   = oEvent.getSource().getSelectedItem();
            var oDesc  = this.byId("mainDescriptionInput");
            var oModel = this.getView().getModel();
            if (oSel) {
                oModel.setProperty("/SelectedServiceNumber", oSel.getKey());
                oModel.setProperty("/SelectedServiceNumberDescription", oSel.getText());
                oDesc.setValue(oSel.getText());
                oDesc.setEditable(false);
            } else {
                oModel.setProperty("/SelectedServiceNumber", "");
                oModel.setProperty("/SelectedServiceNumberDescription", "");
                oDesc.setValue("");
                oDesc.setEditable(true);
            }
        },

        onSubServiceNumberChange: function (oEvent) {
            var oSel   = oEvent.getSource().getSelectedItem();
            var oDesc  = this.byId("subDescriptionInput");
            var oModel = this.getView().getModel();
            if (oSel) {
                oModel.setProperty("/SelectedSubServiceNumber", oSel.getKey());
                oModel.setProperty("/SelectedSubDescriptionText", oSel.getText());
                oModel.setProperty("/SubDescriptionEditable", false);
                oDesc.setValue(oSel.getText());
                oDesc.setEditable(false);
            } else {
                oModel.setProperty("/SelectedSubServiceNumber", "");
                oModel.setProperty("/SelectedSubDescriptionText", "");
                oModel.setProperty("/SubDescriptionEditable", true);
                oDesc.setValue("");
                oDesc.setEditable(true);
            }
        },

        // ─── FORMULA SELECTION ────────────────────────────────────────────────
        onFormulaSelected: function (oEvent) {
            var oSelect   = oEvent.getSource();
            var sId       = oSelect.getId();
            var bIsSub    = sId.includes("sub") || sId.includes("Sub");
            var sKey      = oSelect.getSelectedKey();
            var oModel    = this.getView().getModel();
            var aFormulas = oModel.getProperty("/Formulas") || [];
            var oFormula  = aFormulas.find(f => f.formulaCode === sKey);

            if (bIsSub) {
                oModel.setProperty("/SelectedSubFormula", oFormula || null);
                oModel.setProperty("/HasSelectedSubFormula", !!oFormula);
                if (!oFormula) {
                    var oSubQty = this.byId("subQuantityInput");
                    oSubQty.setEditable(true);
                    oSubQty.setValue("");
                    oModel.setProperty("/SubFormulaParameters", {});
                }
            } else {
                oModel.setProperty("/SelectedFormula", oFormula || null);
                oModel.setProperty("/HasSelectedFormula", !!oFormula);
                if (!oFormula) {
                    this._clearMainFormula();
                }
            }
        },

        onClearFormula: function () {
            var oFormulaSelect = this.byId("formulaSelect");
            if (oFormulaSelect) oFormulaSelect.setSelectedKey("");
            this._clearMainFormula();
            MessageToast.show("Formula cleared. You can now enter quantity manually.");
        },

        _clearMainFormula: function () {
            var oModel = this.getView().getModel();
            oModel.setProperty("/SelectedFormula", null);
            oModel.setProperty("/HasSelectedFormula", false);
            oModel.setProperty("/FormulaParameters", {});
            oModel.setProperty("/IsFormulaBasedQuantity", false);
            var oQty = this.byId("mainQuantityInput");
            if (oQty) { oQty.setValue(""); oQty.setEditable(true); }
            oModel.setProperty("/Total", "0.000");
            oModel.setProperty("/totalWithProfit", "0.000");
            oModel.setProperty("/amountPerUnitWithProfit", "0.000");
        },

        onClearSubFormula: function () {
            var oModel = this.getView().getModel();
            var oFormulaSelect = this.byId("subFormulaSelect");
            if (oFormulaSelect) oFormulaSelect.setSelectedKey("");
            oModel.setProperty("/SelectedSubFormula", null);
            oModel.setProperty("/HasSelectedSubFormula", false);
            oModel.setProperty("/SubFormulaParameters", {});
            var oQty = this.byId("subQuantityInput");
            if (oQty) { oQty.setValue(""); oQty.setEditable(true); }
            oModel.setProperty("/SubTotal", "0.000");
            MessageToast.show("Formula cleared. You can now enter quantity manually.");
        },

        // ─── FORMULA DIALOGS ──────────────────────────────────────────────────
        _calculateFormulaResult: function (oFormula, oParams) {
            if (!oFormula || !oParams) return 0;
            try {
                let expr = oFormula.formulaLogic;
                oFormula.parameterIds.forEach(id => {
                    expr = expr.replaceAll(id, parseFloat(oParams[id]) || 0);
                });
                expr = expr.replace(/\^/g, "**");
                return parseFloat(Function('"use strict";return (' + expr + ')')().toFixed(3));
            } catch (err) {
                console.error("Formula error:", err);
                MessageToast.show("Invalid formula or parameters.");
                return 0;
            }
        },

        onOpenFormulaDialog: function (oEvent) {
            var sLocalId = oEvent.getSource().getId().split('--').pop();
            var sType    = sLocalId === "btnSubParameters" ? "sub" : "main";
            var oModel   = this.getView().getModel();
            var oFormula = sType === "sub" ? oModel.getProperty("/SelectedSubFormula") : oModel.getProperty("/SelectedFormula");
            if (!oFormula) { MessageToast.show("Please select a formula first."); return; }

            var oVBox = sType === "sub" ? this.byId("subFormulaParamContainer") : this.byId("formulaParamContainer");
            oVBox.removeAllItems();
            var oParams = {};
            oFormula.parameterIds.forEach((id, i) => {
                oParams[id] = "";
                oVBox.addItem(new Label({ text: oFormula.parameterDescriptions[i] }));
                oVBox.addItem(new Input({
                    placeholder: "Enter " + oFormula.parameterDescriptions[i],
                    value: "{/" + (sType === "sub" ? "SubFormulaParameters" : "FormulaParameters") + "/" + id + "}"
                }));
            });
            oModel.setProperty(sType === "sub" ? "/SubFormulaParameters" : "/FormulaParameters", oParams);
            (sType === "sub" ? this.byId("SubFormulaDialog") : this.byId("formulaDialog")).open();
        },

        onFormulaDialogOK: function () {
            var oModel   = this.getView().getModel();
            var oFormula = oModel.getProperty("/SelectedFormula");
            var oParams  = oModel.getProperty("/FormulaParameters");
            oModel.setProperty("/SelectedFormulaParams", oParams);
            this.byId("formulaDialog").close();
            var result = this._calculateFormulaResult(oFormula, oParams);
            var oQty = this.byId("mainQuantityInput");
            oQty.setValue(result);
            oQty.setEditable(false);
            oModel.setProperty("/IsFormulaBasedQuantity", true);
            var amt = parseFloat(this.byId("mainAmountPerUnitInput").getValue()) || 0;
            var pm  = parseFloat(this.byId("mainProfitMarginInput").getValue()) || 0;
            var total = result * amt;
            oModel.setProperty("/Total", total.toFixed(3));
            oModel.setProperty("/totalWithProfit", (pm > 0 ? total + total * (pm / 100) : total).toFixed(3));
            oModel.setProperty("/amountPerUnitWithProfit", (pm > 0 ? amt + amt * (pm / 100) : amt).toFixed(3));
        },

        onSubFormulaDialogOK: function () {
            var oModel   = this.getView().getModel();
            var oFormula = oModel.getProperty("/SelectedSubFormula");
            var oParams  = oModel.getProperty("/SubFormulaParameters");
            this.byId("SubFormulaDialog").close();
            var result = this._calculateFormulaResult(oFormula, oParams);
            var oQty = this.byId("subQuantityInput");
            oQty.setValue(result);
            oQty.setEditable(false);
            var amt = parseFloat(this.byId("subAmountPerUnitInput").getValue()) || 0;
            oModel.setProperty("/SubTotal", (result * amt).toFixed(3));
        },

        // ─── ADD MAIN ITEM DIALOG ─────────────────────────────────────────────
        onOpenMainDialog: function () {
            var oView  = this.getView();
            var oModel = oView.getModel();

            oView.byId("mainItemNoInput").setValue("");
            oView.byId("mainDescriptionInput").setValue("");
            oView.byId("mainDescriptionInput").setEditable(true);
            oView.byId("mainAmountPerUnitInput").setValue("");
            oView.byId("mainProfitMarginInput").setValue("");

            var oQty = oView.byId("mainQuantityInput");
            oQty.setValue("");
            oQty.setEditable(true);

            oView.byId("mainServiceNoSelect").setSelectedKey("");
            oView.byId("mainUOMSelect").setSelectedKey("");
            oView.byId("mainCurrencySelect").setSelectedKey(this._sarCurrencyKey || "");  // default SAR
            oView.byId("formulaSelect").setSelectedKey("");

            oModel.setProperty("/Total", 0);
            oModel.setProperty("/totalWithProfit", 0);
            oModel.setProperty("/amountPerUnitWithProfit", 0);
            oModel.setProperty("/SelectedServiceNumber", "");
            oModel.setProperty("/SelectedServiceNumberDescription", "");
            oModel.setProperty("/SelectedFormula", null);
            oModel.setProperty("/HasSelectedFormula", false);
            oModel.setProperty("/FormulaParameters", {});
            oModel.setProperty("/IsFormulaBasedQuantity", false);

            oView.byId("addMainDialog").open();
        },

        onAddMainItem: function () {
            var oView  = this.getView();
            var oModel = oView.getModel();

            var sDesc = oView.byId("mainDescriptionInput").getValue();
            var sQty  = oView.byId("mainQuantityInput").getValue();
            if (!sDesc.trim()) { MessageToast.show("Description is required."); return; }
            if (!sQty || parseFloat(sQty) <= 0) { MessageToast.show("Quantity must be a positive number."); return; }

            var qty   = parseFloat(sQty) || 0;
            var amt   = parseFloat(oView.byId("mainAmountPerUnitInput").getValue()) || 0;
            var pm    = parseFloat(oView.byId("mainProfitMarginInput").getValue()) || 0;
            var total = qty * amt;
            var totalWithProfit = pm > 0 ? (total + total * (pm / 100)) : total;
            var amtWithProfit   = pm > 0 ? (amt + amt * (pm / 100)) : amt;

            var oUOM      = oView.byId("mainUOMSelect").getSelectedItem();
            var oFormula  = oView.byId("formulaSelect").getSelectedItem();
            var oCurrency = oView.byId("mainCurrencySelect").getSelectedItem();

            var oNewItem = {
                salesQuotation: oModel.getProperty("/docNumber"),
                salesQuotationItem: oModel.getProperty("/itemNumber"),
                pricingProcedureStep: "1",
                pricingProcedureCounter: "10",
                customerNumber: "120000",
                invoiceMainItemCode: Date.now().toString(),
                serviceNumberCode: oView.byId("mainServiceNoSelect").getSelectedKey() || "",
                description: sDesc,
                quantity: qty,
                unitOfMeasurementCode: oUOM ? oUOM.getText() : "",
                formulaCode: oFormula ? oFormula.getText() : "",
                currencyCode: oCurrency ? oCurrency.getText() : "",
                amountPerUnit: amt,
                total: total.toFixed(3),
                profitMargin: pm,
                amountPerUnitWithProfit: amtWithProfit.toFixed(3),
                totalWithProfit: totalWithProfit.toFixed(3),
                subItemList: []
            };

            var aItems = oModel.getProperty("/MainItems") || [];
            aItems.push(oNewItem);
            oModel.setProperty("/MainItems", aItems);
            this._recalculateTotalValue();
            oModel.refresh(true);
            this.byId("addMainDialog").close();
            MessageToast.show("Main item added successfully!");
        },

        // ─── ADD SUB ITEM DIALOG ──────────────────────────────────────────────
        onOpenSubDialogForRow: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var oObject  = oContext.getObject();
            var oModel   = this.getView().getModel();

            if (!oObject.subItemList) {
                MessageToast.show("You can only add subitems under a main item!");
                return;
            }
            oModel.setProperty("/selectedMainPath", oContext.getPath());
            this._selectedParent = oObject;

            this.byId("parentMainItemNoInput").setValue(oObject.invoiceMainItemCode || "");
            this.byId("subItemNoInput").setValue("");
            this.byId("subServiceNoInput").setSelectedKey("");
            this.byId("subDescriptionInput").setValue("");
            this.byId("subDescriptionInput").setEditable(true);
            this.byId("subUOMInput").setSelectedKey("");
            this.byId("subFormulaSelect").setSelectedKey("");
            this.byId("subAmountPerUnitInput").setValue("");
            this.byId("subCurrencyInput").setSelectedKey(this._sarCurrencyKey || "");  // default SAR
            this.byId("subTotalInput").setValue("");

            var oSubQty = this.byId("subQuantityInput");
            oSubQty.setValue("");
            oSubQty.setEditable(true);

            oModel.setProperty("/SelectedSubServiceNumber", "");
            oModel.setProperty("/SelectedSubDescriptionText", "");
            oModel.setProperty("/SubDescriptionEditable", true);
            oModel.setProperty("/SelectedSubFormula", null);
            oModel.setProperty("/HasSelectedSubFormula", false);
            oModel.setProperty("/SubFormulaParameters", {});
            oModel.setProperty("/SubTotal", "0");

            this.byId("addSubDialog").open();
        },

        onAddSubItem: function () {
            var oModel    = this.getView().getModel();
            var sMainPath = oModel.getProperty("/selectedMainPath");
            var sDesc     = this.byId("subDescriptionInput").getValue();
            var sQuantity = this.byId("subQuantityInput").getValue();
            var oFormItem = this.byId("subFormulaSelect").getSelectedItem();
            var sFormKey  = oFormItem ? oFormItem.getKey() : "";

            if (!sDesc.trim()) { MessageToast.show("Description is required."); return; }

            var hasQty     = !!sQuantity && parseFloat(sQuantity) > 0;
            var hasFormula = !!sFormKey;
            if (!hasQty && !hasFormula) {
                MessageToast.show("Please enter a quantity OR select a formula with parameters.");
                return;
            }

            var qty = parseFloat(sQuantity) || 0;
            var amt = parseFloat(this.byId("subAmountPerUnitInput").getValue()) || 0;
            var oSvcItem = this.byId("subServiceNoInput").getSelectedItem();
            var oUOMItem = this.byId("subUOMInput").getSelectedItem();
            var oCurItem = this.byId("subCurrencyInput").getSelectedItem();

            var oSubItem = {
                invoiceSubItemCode: Date.now().toString(),
                serviceNumberCode: oSvcItem ? oSvcItem.getKey() : "",
                description: sDesc,
                quantity: qty,
                unitOfMeasurementCode: oUOMItem ? oUOMItem.getText() : "",
                formulaCode: oFormItem ? oFormItem.getText() : "",
                amountPerUnit: amt,
                currencyCode: oCurItem ? oCurItem.getText() : "",
                total: (qty * amt).toFixed(3)
            };

            var oMainItem = oModel.getProperty(sMainPath);
            if (!oMainItem.subItemList) oMainItem.subItemList = [];
            oMainItem.subItemList.push(oSubItem);
            this._recalculateMainFromSubitems(oMainItem);
            oModel.setProperty(sMainPath, oMainItem);
            this._recalculateTotalValue();
            oModel.refresh(true);
            this.byId("addSubDialog").close();
            MessageToast.show("Sub item added successfully!");
        },

        // ─── APPLY PROFIT MARGIN ──────────────────────────────────────────────
        onApplyProfitMargin: function () {
            var oTable   = this.byId("treeTable");
            var oModel   = this.getView().getModel();
            var aIndices = oTable.getSelectedIndices().filter(i => i >= 0);

            if (aIndices.length === 0) {
                MessageToast.show("Please select at least one main item first.");
                return;
            }

            var iProfit  = parseFloat(this.byId("groupInput").getValue()) || 0;
            var bChanged = false;

            aIndices.forEach(iIndex => {
                var oContext = oTable.getContextByIndex(iIndex);
                if (!oContext) return;
                var sPath = oContext.getPath();
                if (sPath.includes("/subItemList/")) return;
                var oItem = oModel.getProperty(sPath);
                oItem.profitMargin = iProfit;
                this._applyProfitToItem(oItem);
                oModel.setProperty(sPath, oItem);
                bChanged = true;
            });

            if (bChanged) {
                this._recalculateTotalValue();
                oModel.refresh(true);
                MessageToast.show("Profit margin applied to selected main items.");
            }
        },

        // ═══════════════════════════════════════════════════════════════════════
        // COST BUTTON — Full simulation/cost logic ported from mainPage app
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Called when the "Cost" button is pressed.
         * Mirrors onOpenSimulation from mainPage_controller.js, adapted to:
         *   - use the default JSONModel instead of named "viewModel"
         *   - use the "costModel" (named) for cost-dialog state
         *   - get selected item info from the tree table
         *   - use a category selector tab at the top of the dialog
         */
        onOpenCost: function () {
            var oTable     = this.byId("treeTable");
            var oModel     = this.getView().getModel();
            var oCostModel = this.getView().getModel("costModel");

            // Validate that at least one row is selected
            var aIndices = oTable.getSelectedIndices().filter(function (i) { return i >= 0; });
            if (aIndices.length === 0) {
                MessageToast.show("Please select at least one item from the table.");
                return;
            }

            // Gather selected item info (use first selected for context)
            var oContext = oTable.getContextByIndex(aIndices[0]);
            var oItem    = oContext ? oContext.getObject() : {};

            // Initialise costModel state — mirrors viewModel setup in reference app
            oCostModel.setProperty("/selectedItemDescription", oItem.description || "");
            oCostModel.setProperty("/selectedCostCategory",    "EAndD");
            oCostModel.setProperty("/totalAmount",             "0.00");
            oCostModel.setProperty("/simulationData",  [{ description: "", Salary: "", Months: "", NoOfPersons: "", Amount: "", __isNew: true }]);
            oCostModel.setProperty("/indirectCostData",[{ Description: "", Unit: "", Qty: "", Cost: "", Labour: "", Total: "", __isNew: true }]);
            oCostModel.setProperty("/materialData",    [{ Description: "", Vendor_Details: "", Quotation_Date: "", Quotation_Price: "", Payment_Terms: "", Freight_Clearance_Charges_Percentage: "", Freight_Clearance_Charges: "", Transportation_Charges: "", SABER: "", Total_Sub_Charges: "", Total_Price: "", __isNew: true }]);
            oCostModel.setProperty("/cablesData",      [{ Description: "", Circuit: "", Runs: "", No_of_ph: "", Approximate_Meter: "", Total: "", Unit_Price: "", Total_Price: "", __isNew: true }]);

            // Store selected row paths for saving cost back to items
            this._costSelectedIndices = aIndices;

            // Destroy any previous cost dialog
            if (this._oCostDialog) {
                this._oCostDialog.destroy();
                this._oCostDialog = null;
            }

            // ── Category selector (SegmentedButton, mirrors TabContainer in reference) ──
            var oCategoryBar = new sap.m.SegmentedButton({
                selectedKey: "EAndD",
                items: [
                    new sap.m.SegmentedButtonItem({ key: "EAndD",        text: "E & D" }),
                    new sap.m.SegmentedButtonItem({ key: "IndirectCost", text: "Indirect Cost" }),
                    new sap.m.SegmentedButtonItem({ key: "Material",     text: "Material" }),
                    new sap.m.SegmentedButtonItem({ key: "Cables",       text: "Cables" })
                ],
                selectionChange: this._onCostCategoryChange.bind(this)
            }).addStyleClass("sapUiSmallMarginBottom");

            // ── Total amount footer strip ──
            var oTotalStrip = new sap.m.HBox({
                justifyContent: "End",
                alignItems: "Center",
                items: [
                    new sap.m.Label({ text: "Total Amount (SAR):" }).addStyleClass("sapUiSmallMarginEnd"),
                    new sap.m.Input({
                        value: "{costModel>/totalAmount}",
                        editable: false,
                        width: "140px"
                    })
                ]
            }).addStyleClass("sapUiSmallMarginTop");

            // ── E & D Table (mirrors oEDTable in reference app) ──────────────
            var oEDTable = new sap.m.Table({
                id: this.createId("costEDTable"),
                visible: true,
                columns: [
                    new sap.m.Column({ header: new sap.m.Text({ text: "Design and Engineering" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Salary" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Months" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "No. of Persons" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Amount (SAR)" }) })
                ],
                items: {
                    path: "costModel>/simulationData",
                    template: new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Input({ value: "{costModel>description}", editable: "{= ${costModel>__isNew} === true }", change: this.onCostSimulationInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Salary}",      editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostSimulationInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Months}",      editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostSimulationInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>NoOfPersons}", editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostSimulationInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Amount}",      editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostAmountDirectChange.bind(this) })
                        ]
                    })
                }
            });

            // ── Indirect Cost Table ───────────────────────────────────────────
            var oIndirectTable = new sap.m.Table({
                id: this.createId("costIndirectTable"),
                visible: false,
                columns: [
                    new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Unit" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Qty" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Cost" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Labour" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Total (SAR)" }) })
                ],
                items: {
                    path: "costModel>/indirectCostData",
                    template: new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Input({ value: "{costModel>Description}", editable: "{= ${costModel>__isNew} === true }", change: this.onCostIndirectInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Unit}",        editable: "{= ${costModel>__isNew} === true }", change: this.onCostIndirectInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Qty}",         editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostIndirectInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Cost}",        editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostIndirectInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Labour}",      editable: "{= ${costModel>__isNew} === true }", change: this.onCostIndirectInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Total}",       editable: false, type: "Number", change: this.onCostTotalDirectChange.bind(this) })
                        ]
                    })
                }
            });

            // ── Material Table ────────────────────────────────────────────────
            var oMaterialTable = new sap.m.Table({
                id: this.createId("costMaterialTable"),
                visible: false,
                columns: [
                    "Material", "Vendor Details", "Quotation Date", "Quotation Price",
                    "Payment Terms", "Freight & Clearance (%)", "Freight & Clearance",
                    "Transportation Charges", "SABER", "Total Sub-Charges", "Total Price"
                ].map(function (t) { return new sap.m.Column({ header: new sap.m.Text({ text: t }) }); }),
                items: {
                    path: "costModel>/materialData",
                    template: new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Input({ value: "{costModel>Description}",                          editable: "{= ${costModel>__isNew} === true }" }),
                            new sap.m.Input({ value: "{costModel>Vendor_Details}",                       editable: "{= ${costModel>__isNew} === true }" }),
                            new sap.m.Input({ value: "{costModel>Quotation_Date}",                       editable: "{= ${costModel>__isNew} === true }" }),
                            new sap.m.Input({ value: "{costModel>Quotation_Price}",                      editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostMaterialInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Payment_Terms}",                        editable: "{= ${costModel>__isNew} === true }" }),
                            new sap.m.Input({ value: "{costModel>Freight_Clearance_Charges_Percentage}", editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostMaterialInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Freight_Clearance_Charges}",            editable: false }),
                            new sap.m.Input({ value: "{costModel>Transportation_Charges}",               editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostMaterialInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>SABER}",                                editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostMaterialInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Total_Sub_Charges}",                   editable: false }),
                            new sap.m.Input({ value: "{costModel>Total_Price}",                         editable: false })
                        ]
                    })
                }
            });

            // ── Cables Table ──────────────────────────────────────────────────
            var oCablesTable = new sap.m.Table({
                id: this.createId("costCablesTable"),
                visible: false,
                columns: [
                    "Description", "Circuit", "Runs", "No of ph",
                    "Approx. Meter", "Total", "Unit Price", "Total Price (SAR)"
                ].map(function (t) { return new sap.m.Column({ header: new sap.m.Text({ text: t }) }); }),
                items: {
                    path: "costModel>/cablesData",
                    template: new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Input({ value: "{costModel>Description}",      editable: "{= ${costModel>__isNew} === true }", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Circuit}",          editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Runs}",             editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>No_of_ph}",         editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Approximate_Meter}",editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Total}",            editable: false }),
                            new sap.m.Input({ value: "{costModel>Unit_Price}",       editable: "{= ${costModel>__isNew} === true }", type: "Number", change: this.onCostCablesInputChange.bind(this) }),
                            new sap.m.Input({ value: "{costModel>Total_Price}",      editable: false })
                        ]
                    })
                }
            });

            // Store table references for category switching
            this._costTables = {
                EAndD:        oEDTable,
                IndirectCost: oIndirectTable,
                Material:     oMaterialTable,
                Cables:       oCablesTable
            };

            // ── Dialog container ──────────────────────────────────────────────
            this._oCostDialog = new sap.m.Dialog({
                title: "Cost Simulation — " + (oItem.description || "Selected Item"),
                contentWidth: "90%",
                contentHeight: "80%",
                resizable: true,
                draggable: true,
                content: new sap.m.VBox({
                    items: [
                        oCategoryBar,
                        oEDTable,
                        oIndirectTable,
                        oMaterialTable,
                        oCablesTable,
                        oTotalStrip
                    ]
                }),
                buttons: [
                    new sap.m.Button({
                        text: "Save Cost to Items",
                        type: "Emphasized",
                        press: this.onSaveCost.bind(this)
                    }),
                    new sap.m.Button({
                        text: "Add New Line",
                        press: this.onAddNewCostLine.bind(this)
                    }),
                    new sap.m.Button({
                        text: "Close",
                        press: function () { this._oCostDialog.close(); }.bind(this)
                    })
                ]
            });

            this.getView().addDependent(this._oCostDialog);
            this._oCostDialog.setModel(oCostModel, "costModel");
            this._oCostDialog.open();
        },

        /**
         * Fires when the user switches category tabs inside the Cost dialog.
         * Shows only the relevant table, mirrors the category logic in reference app.
         */
        _onCostCategoryChange: function (oEvent) {
            var sKey       = oEvent.getParameter("item").getKey();
            var oCostModel = this.getView().getModel("costModel");
            oCostModel.setProperty("/selectedCostCategory", sKey);

            // Show only the active table
            Object.keys(this._costTables).forEach(function (k) {
                this._costTables[k].setVisible(k === sKey);
            }.bind(this));

            this._updateCostTotalAmount();
        },

        // ─── COST INPUT CHANGE HANDLERS ───────────────────────────────────────
        // These mirror onSimulationInputChange, onIndirectCostInputChange, etc.
        // from the reference mainPage_controller.js, using "costModel" instead of "viewModel".

        onCostSimulationInputChange: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex   = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/simulationData");

            var salary      = parseFloat(aData[iIndex].Salary) || 0;
            var months      = parseFloat(aData[iIndex].Months) || 0;
            var noOfPersons = parseFloat(aData[iIndex].NoOfPersons) || 0;

            aData[iIndex].Amount = (salary && months && noOfPersons)
                ? (salary * months * noOfPersons).toFixed(2)
                : "";

            oCostModel.setProperty("/simulationData", aData);
            this._updateCostTotalAmount();
        },

        onCostAmountDirectChange: function (oEvent) {
            var oContext   = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex     = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/simulationData");
            // User typed amount directly — clear formula fields
            aData[iIndex].Salary      = "";
            aData[iIndex].Months      = "";
            aData[iIndex].NoOfPersons = "";
            oCostModel.setProperty("/simulationData", aData);
            this._updateCostTotalAmount();
        },

        onCostIndirectInputChange: function (oEvent) {
            var oContext   = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex     = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/indirectCostData");

            var qty  = parseFloat(aData[iIndex].Qty)  || 0;
            var cost = parseFloat(aData[iIndex].Cost) || 0;
            aData[iIndex].Total = (qty && cost) ? (qty * cost).toFixed(2) : "";

            oCostModel.setProperty("/indirectCostData", aData);
            this._updateCostTotalAmount();
        },

        onCostTotalDirectChange: function (oEvent) {
            var oContext   = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex     = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/indirectCostData");
            aData[iIndex].Qty  = "";
            aData[iIndex].Cost = "";
            oCostModel.setProperty("/indirectCostData", aData);
            this._updateCostTotalAmount();
        },

        onCostMaterialInputChange: function (oEvent) {
            var oContext   = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex     = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/materialData");

            var quotationPrice = parseFloat(aData[iIndex].Quotation_Price) || 0;
            var freightPct     = parseFloat(aData[iIndex].Freight_Clearance_Charges_Percentage) || 0;
            var transport      = parseFloat(aData[iIndex].Transportation_Charges) || 0;
            var saber          = parseFloat(aData[iIndex].SABER) || 0;

            var freightAmt = (quotationPrice * freightPct / 100);
            aData[iIndex].Freight_Clearance_Charges = freightAmt.toFixed(2);

            var totalSub = freightAmt + transport + saber;
            aData[iIndex].Total_Sub_Charges = totalSub.toFixed(2);
            aData[iIndex].Total_Price = (quotationPrice + totalSub).toFixed(2);

            oCostModel.setProperty("/materialData", aData);
            this._updateCostTotalAmount();
        },

        onCostCablesInputChange: function (oEvent) {
            var oContext   = oEvent.getSource().getBindingContext("costModel");
            if (!oContext) return;
            var iIndex     = parseInt(oContext.getPath().split("/").pop(), 10);
            var oCostModel = this.getView().getModel("costModel");
            var aData      = oCostModel.getProperty("/cablesData");

            var circuit    = parseFloat(aData[iIndex].Circuit) || 0;
            var runs       = parseFloat(aData[iIndex].Runs) || 0;
            var noOfPh     = parseFloat(aData[iIndex].No_of_ph) || 0;
            var approxMtr  = parseFloat(aData[iIndex].Approximate_Meter) || 0;
            var unitPrice  = parseFloat(aData[iIndex].Unit_Price) || 0;

            if (circuit && runs && noOfPh && approxMtr) {
                aData[iIndex].Total = (circuit * runs * noOfPh * approxMtr).toFixed(2);
                aData[iIndex].Total_Price = unitPrice
                    ? (circuit * runs * noOfPh * approxMtr * unitPrice).toFixed(2)
                    : "";
            } else {
                aData[iIndex].Total       = "";
                aData[iIndex].Total_Price = "";
            }

            oCostModel.setProperty("/cablesData", aData);
            this._updateCostTotalAmount();
        },

        /**
         * Recalculates the running totalAmount for the active category.
         * Mirrors updateTotalAmount() from reference app.
         */
        _updateCostTotalAmount: function () {
            var oCostModel = this.getView().getModel("costModel");
            var sCategory  = oCostModel.getProperty("/selectedCostCategory");
            var totalAmount = 0;

            if (sCategory === "EAndD") {
                totalAmount = (oCostModel.getProperty("/simulationData") || [])
                    .reduce(function (s, r) { return s + (parseFloat(r.Amount) || 0); }, 0);
            } else if (sCategory === "IndirectCost") {
                totalAmount = (oCostModel.getProperty("/indirectCostData") || [])
                    .reduce(function (s, r) { return s + (parseFloat(r.Total) || 0); }, 0);
            } else if (sCategory === "Material") {
                totalAmount = (oCostModel.getProperty("/materialData") || [])
                    .reduce(function (s, r) { return s + (parseFloat(r.Total_Price) || 0); }, 0);
            } else if (sCategory === "Cables") {
                totalAmount = (oCostModel.getProperty("/cablesData") || [])
                    .reduce(function (s, r) { return s + (parseFloat(r.Total_Price) || 0); }, 0);
            }

            oCostModel.setProperty("/totalAmount", totalAmount.toFixed(2));
        },

        /**
         * Adds a new editable row to the active category table.
         * Mirrors onAddNewLine() from reference app.
         */
        onAddNewCostLine: function () {
            var oCostModel = this.getView().getModel("costModel");
            var sCategory  = oCostModel.getProperty("/selectedCostCategory");
            var sPath, oNewRow;

            switch (sCategory) {
                case "EAndD":
                    sPath   = "/simulationData";
                    oNewRow = { description: "", Salary: "", Months: "", NoOfPersons: "", Amount: "", __isNew: true };
                    break;
                case "IndirectCost":
                    sPath   = "/indirectCostData";
                    oNewRow = { Description: "", Unit: "", Qty: "", Cost: "", Labour: "", Total: "", __isNew: true };
                    break;
                case "Material":
                    sPath   = "/materialData";
                    oNewRow = { Description: "", Vendor_Details: "", Quotation_Date: "", Quotation_Price: "", Payment_Terms: "", Freight_Clearance_Charges_Percentage: "", Freight_Clearance_Charges: "", Transportation_Charges: "", SABER: "", Total_Sub_Charges: "", Total_Price: "", __isNew: true };
                    break;
                case "Cables":
                    sPath   = "/cablesData";
                    oNewRow = { Description: "", Circuit: "", Runs: "", No_of_ph: "", Approximate_Meter: "", Total: "", Unit_Price: "", Total_Price: "", __isNew: true };
                    break;
                default:
                    MessageToast.show("Please select a cost category first.");
                    return;
            }

            var aData = oCostModel.getProperty(sPath) || [];
            if (aData.some(function (r) { return r.__isNew; })) {
                MessageToast.show("Please fill in the existing new row before adding another.");
                return;
            }
            aData.push(oNewRow);
            oCostModel.setProperty(sPath, aData);
            oCostModel.refresh(true);
        },

        /**
         * Saves the calculated cost total back to the selected tendering item(s).
         * The totalAmount is applied to amountPerUnit of each selected main item,
         * then totals are recalculated — seamlessly integrating cost into the BoQ.
         * Mirrors onSaveSimulation() flow from reference app.
         */
        onSaveCost: function () {
            var oTable     = this.byId("treeTable");
            var oModel     = this.getView().getModel();
            var oCostModel = this.getView().getModel("costModel");

            this._updateCostTotalAmount();  // ensure up to date
            var sTotalAmount = oCostModel.getProperty("/totalAmount");
            var fTotal       = parseFloat(sTotalAmount) || 0;

            if (fTotal <= 0) {
                MessageBox.warning("The calculated cost total is 0. Please enter cost data before saving.");
                return;
            }

            var aIndices = this._costSelectedIndices || [];
            if (aIndices.length === 0) {
                MessageToast.show("No items were selected.");
                return;
            }

            var bChanged = false;
            aIndices.forEach(function (iIndex) {
                var oContext = oTable.getContextByIndex(iIndex);
                if (!oContext) return;
                var sPath = oContext.getPath();
                // Only apply to main items (not sub-items)
                if (sPath.includes("/subItemList/")) return;
                var oItem = oModel.getProperty(sPath);
                // Distribute total evenly across selected items
                oItem.amountPerUnit = (fTotal / aIndices.length).toFixed(3);
                this._applyProfitToItem(oItem);
                oModel.setProperty(sPath, oItem);
                bChanged = true;
            }.bind(this));

            if (bChanged) {
                this._recalculateTotalValue();
                oModel.refresh(true);
                MessageToast.show("Cost of " + fTotal.toFixed(2) + " SAR applied to " + aIndices.length + " item(s). Remember to Save Document.");
                this._oCostDialog.close();
            } else {
                MessageToast.show("No main items were updated (sub-items cannot receive direct cost).");
            }
        },

        // ─── END COST LOGIC ───────────────────────────────────────────────────

        // ─── SAVE DOCUMENT ────────────────────────────────────────────────────
        onSaveDocument: function () {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/MainItems") || [];

            aItems.forEach(item => {
                if (item.subItemList && item.subItemList.length > 0) {
                    this._recalculateMainFromSubitems(item);
                } else {
                    this._applyProfitToItem(item);
                }
            });
            this._recalculateTotalValue();

            var cleanedItems = aItems.map(item => {
                const {
                    createdAt, modifiedAt, createdBy, modifiedBy, invoiceMainItemCode,
                    serviceNumber_serviceNumberCode, currencyText, formulaText, unitOfMeasurementText,
                    salesQuotation, salesQuotationItem, pricingProcedureCounter, pricingProcedureStep,
                    customerNumber,
                    parameters,
                    ...rest
                } = item;
                rest.totalHeader = parseFloat(Number(rest.totalHeader || 0).toFixed(3));

                const cleanedSubs = (item.subItemList || [])
                    .filter(sub => sub && sub.serviceNumberCode)
                    .map(sub => {
                        const {
                            invoiceMainItemCode, createdAt, createdBy, modifiedAt, modifiedBy,
                            invoiceSubItemCode, mainItem_invoiceMainItemCode,
                            serviceNumber_serviceNumberCode,
                            parameters,
                            ...subRest
                        } = sub;
                        return {
                            ...subRest,
                            amountPerUnit: parseFloat(Number(subRest.amountPerUnit || 0).toFixed(3)),
                            total: parseFloat(Number(subRest.total || 0).toFixed(3))
                        };
                    });
                return { ...rest, subItemList: cleanedSubs };
            });

            var body = {
                salesQuotation: oModel.getProperty("/docNumber"),
                salesQuotationItem: oModel.getProperty("/itemNumber"),
                pricingProcedureStep: "20",
                pricingProcedureCounter: "1",
                customerNumber: "120000",
                invoiceMainItemCommands: cleanedItems
            };

            fetch("/odata/v4/sales-cloud/saveOrUpdateMainItems", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
                .then(r => { if (!r.ok) throw new Error("Save failed: " + r.statusText); return r.json(); })
                .then(saved => {
                    var updated = Array.isArray(saved.value) ? saved.value.map(item => ({
                        ...item,
                        subItemList: Array.isArray(item.subItemList) ? item.subItemList : []
                    })) : [];
                    oModel.setProperty("/MainItems", updated);
                    var totalValue = updated.reduce((sum, r) => sum + Number(r.totalWithProfit || r.total || 0), 0);
                    oModel.setProperty("/totalValue", totalValue);
                    oModel.refresh(true);
                    MessageToast.show("Document saved successfully!");
                })
                .catch(err => {
                    console.error("Error saving:", err);
                    try {
                        MessageBox.error("Save failed: " + err.message);
                    } catch (e) {
                        MessageToast.show("Save failed: " + err.message);
                    }
                });
        },

        // ─── EDIT ROW ─────────────────────────────────────────────────────────
        onEditRow: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            if (!oContext) { MessageToast.show("No item context found."); return; }
            var oData  = oContext.getObject();
            var oModel = this.getView().getModel();
            this._editPath = oContext.getPath();
            oModel.setProperty("/editRow", Object.assign({}, oData));

            var bIsSub = !!oData.invoiceSubItemCode;
            if (bIsSub) {
                if (!this._oEditSubDialog) {
                    var oSubForm = new sap.ui.layout.form.SimpleForm({
                        layout: "ResponsiveGridLayout", editable: true,
                        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                        adjustLabelSpan: false, emptySpanXL: 1, emptySpanL: 1, emptySpanM: 1, emptySpanS: 0,
                        columnsXL: 1, columnsL: 1, columnsM: 1,
                        content: [
                            new sap.m.Label({ text: "Service No" }),
                            new sap.m.Select(this.createId("editSubServiceNo"), { selectedKey: "{/editRow/serviceNumberCode}", items: { path: "/ServiceNumbers", template: new sap.ui.core.Item({ key: "{serviceNumberCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Description" }),
                            new sap.m.Input({ value: "{/editRow/description}" }),
                            new sap.m.Label({ text: "Quantity" }),
                            new sap.m.Input({ value: "{/editRow/quantity}", type: "Number", liveChange: this._onSubValueChange.bind(this) }),
                            new sap.m.Label({ text: "UOM" }),
                            new sap.m.Select(this.createId("editSubUOM"), { selectedKey: "{/editRow/unitOfMeasurementCode}", items: { path: "/UOM", template: new sap.ui.core.Item({ key: "{unitOfMeasurementCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Formula" }),
                            new sap.m.Select(this.createId("editSubFormula"), { selectedKey: "{/editRow/formulaCode}", forceSelection: false, items: { path: "/Formulas", templateShareable: false, template: new sap.ui.core.Item({ key: "{formulaCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Amount Per Unit" }),
                            new sap.m.Input({ value: "{/editRow/amountPerUnit}", type: "Number", liveChange: this._onSubValueChange.bind(this) }),
                            new sap.m.Label({ text: "Currency" }),
                            new sap.m.Select(this.createId("editSubCurrency"), { selectedKey: "{/editRow/currencyCode}", items: { path: "/Currency", template: new sap.ui.core.Item({ key: "{currencyCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Total" }),
                            new sap.m.Input({ value: "{/editRow/total}", editable: false })
                        ]
                    });
                    this._oEditSubDialog = new sap.m.Dialog({
                        title: "Edit Sub Item", contentWidth: "700px", contentHeight: "auto", resizable: true, draggable: true,
                        content: [oSubForm],
                        beginButton: new sap.m.Button({ text: "Save", type: "Emphasized", press: this.onSaveEdit.bind(this) }),
                        endButton: new sap.m.Button({ text: "Cancel", press: () => { this._oEditSubDialog.close(); this._oEditSubDialog.destroy(); this._oEditSubDialog = null; } })
                    });
                    this.getView().addDependent(this._oEditSubDialog);
                }
                this._oEditSubDialog.open();
            } else {
                if (!this._oEditMainDialog) {
                    var oMainForm = new sap.ui.layout.form.SimpleForm({
                        layout: "ResponsiveGridLayout", editable: true,
                        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                        adjustLabelSpan: false, emptySpanXL: 1, emptySpanL: 1, emptySpanM: 1, emptySpanS: 0,
                        columnsXL: 1, columnsL: 1, columnsM: 1,
                        content: [
                            new sap.m.Label({ text: "Service No" }),
                            new sap.m.Select(this.createId("editMainServiceNo"), { selectedKey: "{/editRow/serviceNumberCode}", items: { path: "/ServiceNumbers", template: new sap.ui.core.Item({ key: "{serviceNumberCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Description" }),
                            new sap.m.Input({ value: "{/editRow/description}" }),
                            new sap.m.Label({ text: "Quantity" }),
                            new sap.m.Input(this.createId("editMainQuantityInput"), { value: "{/editRow/quantity}", type: "Number", liveChange: this.onInputChange.bind(this) }),
                            new sap.m.Label({ text: "UOM" }),
                            new sap.m.Select(this.createId("editMainUOMSelect"), { selectedKey: "{/editRow/unitOfMeasurementCode}", items: { path: "/UOM", template: new sap.ui.core.Item({ key: "{unitOfMeasurementCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Formula" }),
                            new sap.m.Select(this.createId("editFormulaSelect"), { selectedKey: "{/editRow/formulaCode}", change: this._onEditFormulaSelected.bind(this), items: { path: "/Formulas", template: new sap.ui.core.Item({ key: "{formulaCode}", text: "{description}" }) } }),
                            new sap.m.Button(this.createId("btnEditEnterParams"), { text: "Enter Parameters", enabled: "{= ${/editRow/formulaCode} ? true : false }", press: this.onOpenEditFormulaDialog.bind(this) }),
                            new sap.m.Label({ text: "Amount Per Unit" }),
                            new sap.m.Input(this.createId("editMainAmountPerUnitInput"), { value: "{/editRow/amountPerUnit}", type: "Number", liveChange: this.onInputChange.bind(this) }),
                            new sap.m.Label({ text: "Currency" }),
                            new sap.m.Select(this.createId("editMainCurrencySelect"), { selectedKey: "{/editRow/currencyCode}", items: { path: "/Currency", template: new sap.ui.core.Item({ key: "{currencyCode}", text: "{description}" }) } }),
                            new sap.m.Label({ text: "Total" }),
                            new sap.m.Input(this.createId("editMainTotalInput"), { value: "{/editRow/total}", editable: false }),
                            new sap.m.Label({ text: "Profit Margin" }),
                            new sap.m.Input(this.createId("editMainProfitMarginInput"), { value: "{/editRow/profitMargin}", type: "Number", liveChange: this.onInputChange.bind(this) }),
                            new sap.m.Label({ text: "Amount Per Unit with Profit" }),
                            new sap.m.Input(this.createId("editMainAmountPerUnitWithProfitInput"), { value: "{/editRow/amountPerUnitWithProfit}", editable: false }),
                            new sap.m.Label({ text: "Total with Profit" }),
                            new sap.m.Input(this.createId("editMainTotalWithProfitInput"), { value: "{/editRow/totalWithProfit}", editable: false })
                        ]
                    });
                    this._oEditMainDialog = new sap.m.Dialog({
                        title: "Edit Main Item", contentWidth: "700px", contentHeight: "auto", resizable: true, draggable: true,
                        content: [oMainForm],
                        beginButton: new sap.m.Button({ text: "Save", type: "Emphasized", press: this.onSaveEdit.bind(this) }),
                        endButton: new sap.m.Button({ text: "Cancel", press: () => { this._oEditMainDialog.close(); this._oEditMainDialog.destroy(); this._oEditMainDialog = null; } })
                    });
                    this.getView().addDependent(this._oEditMainDialog);
                }
                this._oEditMainDialog.open();
            }
        },

        _onSubValueChange: function (oEvent) {
            var oModel   = this.getView().getModel();
            var oEditRow = oModel.getProperty("/editRow") || {};
            var val      = parseFloat(oEvent.getParameter("value"));
            var fieldId  = oEvent.getSource().getBindingInfo("value").parts[0].path.split("/").pop();
            oEditRow[fieldId] = isNaN(val) ? 0 : val;
            oEditRow.total = ((parseFloat(oEditRow.quantity) || 0) * (parseFloat(oEditRow.amountPerUnit) || 0)).toFixed(3);
            oModel.setProperty("/editRow", oEditRow);
        },

        _onEditFormulaSelected: function () { /* formula change in edit dialog */ },

        onOpenEditFormulaDialog: function () {
            var oModel       = this.getView().getModel();
            var sFormulaCode = oModel.getProperty("/editRow/formulaCode");
            if (!sFormulaCode) { MessageToast.show("Please select a formula first."); return; }
            var oFormula = (oModel.getProperty("/Formulas") || []).find(f => f.formulaCode === sFormulaCode);
            if (!oFormula) { MessageToast.show("Formula not found."); return; }

            var oVBox = new sap.m.VBox({ id: this.createId("editFormulaParamBox") });
            oFormula.parameterDescriptions.forEach((desc, i) => {
                oVBox.addItem(new sap.m.Label({ text: desc }));
                oVBox.addItem(new sap.m.Input(this.createId("editParam_" + oFormula.parameterIds[i]), { placeholder: "Enter " + desc }));
            });
            var oDialog = new sap.m.Dialog({
                title: "Enter Formula Parameters", content: [oVBox],
                beginButton: new sap.m.Button({
                    text: "OK", type: "Emphasized",
                    press: () => {
                        var oParams = {};
                        oFormula.parameterIds.forEach(id => { oParams[id] = this.byId("editParam_" + id).getValue(); });
                        oModel.setProperty("/editRow/quantity", this._calculateFormulaResult(oFormula, oParams));
                        MessageToast.show("Quantity updated.");
                        oDialog.close();
                    }
                }),
                endButton: new sap.m.Button({ text: "Cancel", press: () => oDialog.close() })
            });
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        onSaveEdit: function () {
            var oView   = this.getView();
            var oModel  = oView.getModel();
            var oEdited = oModel.getProperty("/editRow");
            var bIsSub  = !!oEdited.invoiceSubItemCode;

            var oCurrSel = bIsSub ? oView.byId("editSubCurrency") : oView.byId("editMainCurrencySelect");
            var oUOMSel  = bIsSub ? oView.byId("editSubUOM")      : oView.byId("editMainUOMSelect");
            var oFrmSel  = bIsSub ? oView.byId("editSubFormula")  : oView.byId("editFormulaSelect");

            var oCurItem = oCurrSel && oCurrSel.getSelectedItem();
            oEdited.currencyCode = oCurItem ? oCurItem.getText() : "";
            var oUOMItem = oUOMSel && oUOMSel.getSelectedItem();
            oEdited.unitOfMeasurementCode = oUOMItem ? oUOMItem.getText() : "";
            var oFrmItem = oFrmSel && oFrmSel.getSelectedItem();
            oEdited.formulaCode = oFrmItem ? oFrmItem.getText() : "";

            if (bIsSub) {
                oEdited.total = ((parseFloat(oEdited.quantity) || 0) * (parseFloat(oEdited.amountPerUnit) || 0)).toFixed(3);
            } else {
                var hasSubItems = Array.isArray(oEdited.subItemList) && oEdited.subItemList.length > 0;
                if (!hasSubItems) this._applyProfitToItem(oEdited);
            }

            oModel.setProperty(this._editPath, oEdited);

            if (bIsSub) {
                var aParts = this._editPath.split('/');
                var iMain  = parseInt(aParts[aParts.indexOf('MainItems') + 1]);
                if (iMain >= 0) {
                    var oMain = oModel.getProperty("/MainItems/" + iMain);
                    if (oMain) { this._recalculateMainFromSubitems(oMain); oModel.setProperty("/MainItems/" + iMain, oMain); }
                }
            }

            this._recalculateTotalValue();
            oModel.refresh(true);
            MessageToast.show("The line was updated successfully");

            if (this._oEditSubDialog  && this._oEditSubDialog.isOpen())  { this._oEditSubDialog.close();  this._oEditSubDialog.destroy();  this._oEditSubDialog  = null; }
            if (this._oEditMainDialog && this._oEditMainDialog.isOpen()) { this._oEditMainDialog.close(); this._oEditMainDialog.destroy(); this._oEditMainDialog = null; }
        },

        // ─── DELETE ───────────────────────────────────────────────────────────
        onDeleteRow: function (oEvent) {
            var oModel   = this.getView().getModel();
            var oContext = oEvent.getSource().getBindingContext();
            var oObject  = oContext.getObject();
            var sPath    = oContext.getPath();

            MessageBox.confirm("Are you sure you want to delete this item?", {
                title: "Confirm Deletion",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: (sAction) => {
                    if (sAction !== MessageBox.Action.YES) return;
                    var aParts = sPath.split("/");
                    if (oObject.invoiceSubItemCode) {
                        var iMain = parseInt(aParts[2]), iSub = parseInt(aParts[4]);
                        var aItems = oModel.getProperty("/MainItems");
                        aItems[iMain].subItemList.splice(iSub, 1);
                        this._recalculateMainFromSubitems(aItems[iMain]);
                        MessageToast.show("Sub item deleted.");
                    } else {
                        var aItems2 = oModel.getProperty("/MainItems");
                        aItems2.splice(parseInt(aParts[2]), 1);
                        MessageToast.show("Main item deleted.");
                    }
                    this._recalculateTotalValue();
                    oModel.refresh(true);
                }
            });
        },

        // ─── SEARCH ───────────────────────────────────────────────────────────
        onSearch: function (oEvent) {
            var oBinding = this.byId("treeTable").getBinding("rows");
            if (!oBinding) return;
            var sQuery = oEvent.getParameter("query") || oEvent.getSource().getValue();
            if (!sQuery) { oBinding.filter([]); return; }
            oBinding.filter(new sap.ui.model.Filter({
                filters: [
                    new sap.ui.model.Filter("serviceNumberCode",     sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("description",           sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("unitOfMeasurementCode", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("currencyCode",          sap.ui.model.FilterOperator.Contains, sQuery)
                ],
                and: false
            }));
        },

        // ─── IMPORT / EXPORT ──────────────────────────────────────────────────
        // ─── IMPORT FROM MODEL ────────────────────────────────────────────
        /**
         * Step 1: shows all ModelSpecifications for the user to pick one.
         * Mirrors Spring Boot GET /modelspecs.
         */
        _openModelImportDialog: function () {
            var oMainModel = this.getView().getModel();
            var that = this;

            fetch('/odata/v4/sales-cloud/ModelSpecifications')
                .then(function (r) {
                    if (!r.ok) throw new Error('Failed to load model specs: ' + r.statusText);
                    return r.json();
                })
                .then(function (data) {
                    var aModels = Array.isArray(data.value) ? data.value : [];
                    if (!aModels.length) { MessageToast.show('No model specifications found.'); return; }

                    var oListModel = new sap.ui.model.json.JSONModel({ models: aModels });
                    var oTable = new sap.m.Table({
                        mode: 'SingleSelectMaster',
                        columns: [
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Code' }),        width: '80px' }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Description' }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Currency' }),    width: '80px' })
                        ],
                        items: {
                            path: '/models',
                            template: new sap.m.ColumnListItem({
                                type: 'Active',
                                cells: [
                                    new sap.m.Text({ text: '{modelSpecCode}' }),
                                    new sap.m.Text({ text: '{description}' }),
                                    new sap.m.Text({ text: '{currencyCode}' })
                                ]
                            })
                        }
                    });
                    oTable.setModel(oListModel);

                    var oDialog = new sap.m.Dialog({
                        title: 'Select Model Specification',
                        contentWidth: '500px',
                        content: [oTable],
                        beginButton: new sap.m.Button({
                            text: 'Next', type: 'Emphasized',
                            press: function () {
                                var oSel = oTable.getSelectedItem();
                                if (!oSel) { MessageToast.show('Please select a model.'); return; }
                                var oModelData = oSel.getBindingContext().getObject();
                                oDialog.close(); oDialog.destroy();
                                that._openModelDetailDialog(oModelData, oMainModel);
                            }
                        }),
                        endButton: new sap.m.Button({ text: 'Cancel', press: function () { oDialog.close(); oDialog.destroy(); } })
                    });
                    that.getView().addDependent(oDialog);
                    oDialog.open();
                })
                .catch(function (err) {
                    console.error('Error loading model specs:', err);
                    MessageToast.show('Failed to load model specifications.');
                });
        },

        /**
         * Step 2: shows the detail lines for the chosen model (multi-select).
         * Maps ModelSpecificationsDetails fields → InvoiceMainItem:
         *   shortText           → description
         *   serviceNumberCode   → serviceNumberCode
         *   quantity            → quantity
         *   grossPrice          → amountPerUnit
         *   unitOfMeasurementCode, formulaCode, currencyCode (falls back to parent model)
         */
        _openModelDetailDialog: function (oModelData, oMainModel) {
            var that = this;
            var sModelCode     = oModelData.modelSpecCode;
            var sModelCurrency = oModelData.currencyCode || '';

            fetch('/odata/v4/sales-cloud/ModelSpecificationsDetails?$filter=modelSpecifications_modelSpecCode eq ' + sModelCode)
                .then(function (r) {
                    if (!r.ok) throw new Error('Failed to load model details: ' + r.statusText);
                    return r.json();
                })
                .then(function (data) {
                    var aDetails = Array.isArray(data.value) ? data.value : [];
                    if (!aDetails.length) { MessageToast.show('No detail lines found for this model.'); return; }

                    var oDetailModel = new sap.ui.model.json.JSONModel({ details: aDetails });
                    var oDetailTable = new sap.m.Table({
                        mode: 'MultiSelect',
                        columns: [
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Service No' }), width: '80px' }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Description' }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Qty' }),      width: '60px' }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'UOM' }),      width: '70px' }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Price' }),    width: '80px' }),
                            new sap.m.Column({ header: new sap.m.Text({ text: 'Currency' }), width: '80px' })
                        ],
                        items: {
                            path: '/details',
                            template: new sap.m.ColumnListItem({
                                type: 'Active',
                                cells: [
                                    new sap.m.Text({ text: '{serviceNumberCode}' }),
                                    new sap.m.Text({ text: '{shortText}' }),
                                    new sap.m.Text({ text: '{quantity}' }),
                                    new sap.m.Text({ text: '{unitOfMeasurementCode}' }),
                                    new sap.m.Text({ text: '{grossPrice}' }),
                                    new sap.m.Text({ text: '{currencyCode}' })
                                ]
                            })
                        }
                    });
                    oDetailTable.setModel(oDetailModel);

                    var oDetailDialog = new sap.m.Dialog({
                        title: 'Select Lines from: ' + (oModelData.description || sModelCode),
                        contentWidth: '700px',
                        content: [oDetailTable],
                        beginButton: new sap.m.Button({
                            text: 'Add Selected', type: 'Emphasized',
                            press: function () {
                                var aSelected = oDetailTable.getSelectedItems();
                                if (!aSelected.length) { MessageToast.show('Please select at least one line.'); return; }

                                var aItems = oMainModel.getProperty('/MainItems') || [];
                                aSelected.forEach(function (oItem) {
                                    var d   = oItem.getBindingContext().getObject();
                                    var qty = parseFloat(d.quantity)  || 0;
                                    var amt = parseFloat(d.grossPrice) || 0;
                                    var tot = qty * amt;
                                    aItems.push({
                                        salesQuotation:          oMainModel.getProperty('/docNumber'),
                                        salesQuotationItem:      oMainModel.getProperty('/itemNumber'),
                                        pricingProcedureStep:    '1',
                                        pricingProcedureCounter: '10',
                                        customerNumber:          '120000',
                                        invoiceMainItemCode:     Date.now().toString() + Math.random(),
                                        serviceNumberCode:       '',  // ModelSpecificationsDetails.serviceNumberCode is Integer; InvoiceMainItem expects UUID — omit to avoid 400
                                        description:             d.shortText               || '',
                                        quantity:                qty,
                                        unitOfMeasurementCode:   d.unitOfMeasurementCode   || '',
                                        formulaCode:             d.formulaCode             || '',
                                        currencyCode:            d.currencyCode || sModelCurrency,
                                        amountPerUnit:           amt,
                                        total:                   tot.toFixed(3),
                                        profitMargin:            0,
                                        amountPerUnitWithProfit: amt.toFixed(3),
                                        totalWithProfit:         tot.toFixed(3),
                                        subItemList:             []
                                    });
                                });

                                oMainModel.setProperty('/MainItems', aItems);
                                that._recalculateTotalValue();
                                oMainModel.refresh(true);
                                MessageToast.show(aSelected.length + ' line(s) imported from model.');
                                oDetailDialog.close(); oDetailDialog.destroy();
                            }
                        }),
                        endButton: new sap.m.Button({ text: 'Cancel', press: function () { oDetailDialog.close(); oDetailDialog.destroy(); } })
                    });
                    that.getView().addDependent(oDetailDialog);
                    oDetailDialog.open();
                })
                .catch(function (err) {
                    console.error('Error loading model details:', err);
                    MessageToast.show('Failed to load model detail lines.');
                });
        },

        _openExcelUploadDialogTendering: function () {
            var selectedFile;
            var oMainModel = this.getView().getModel();
            var oFileUploader = new sap.ui.unified.FileUploader({ width: "100%", fileType: ["xls","xlsx"], sameFilenameAllowed: true, change: e => { selectedFile = e.getParameter("files")[0]; } });
            var oDialogContent = new sap.m.VBox({ items: [oFileUploader] });
            var oExcelTable;
            var oExcelDialog = new sap.m.Dialog({
                title: "Import Main Items from Excel", contentWidth: "80%", contentHeight: "70%", content: [oDialogContent],
                buttons: [
                    new sap.m.Button({ text: "Add Selected", type: "Emphasized", press: () => {
                        var rows = oExcelTable.getModel().getProperty("/rows").filter(r => r.selected);
                        if (!rows.length) { MessageToast.show("Please select at least one row!"); return; }
                        var aItems = oMainModel.getProperty("/MainItems") || [];
                        rows.forEach(row => {
                            var qty = parseFloat(row["Quantity"]) || 0, amt = parseFloat(row["Amount Per Unit"]) || 0, pm = parseFloat(row["Profit Margin"]) || 0;
                            var total = qty * amt;
                            aItems.push({ salesQuotation: oMainModel.getProperty("/docNumber"), salesQuotationItem: oMainModel.getProperty("/itemNumber"), pricingProcedureStep: "1", pricingProcedureCounter: "10", customerNumber: "120000", invoiceMainItemCode: Date.now().toString(), serviceNumberCode: row["Service No"] || "", description: row["Description"] || "", quantity: qty, unitOfMeasurementCode: row["UOM"] || "", formulaCode: row["Formula"] || "", currencyCode: row["Currency"] || "", amountPerUnit: amt, total: total.toFixed(3), profitMargin: pm, amountPerUnitWithProfit: (pm > 0 ? amt + amt*(pm/100) : amt).toFixed(3), totalWithProfit: (pm > 0 ? total + total*(pm/100) : total).toFixed(3), subItemList: [] });
                        });
                        oMainModel.setProperty("/MainItems", aItems);
                        this._recalculateTotalValue();
                        oMainModel.refresh(true);
                        MessageToast.show("Items added successfully!");
                        oExcelDialog.close();
                    }}),
                    new sap.m.Button({ text: "Add All", press: () => { var rows = oExcelTable.getModel().getProperty("/rows"); rows.forEach(r => r.selected = true); oExcelTable.getModel().refresh(); oExcelDialog.getButtons()[0].firePress(); } }),
                    new sap.m.Button({ text: "Cancel", press: () => oExcelDialog.close() })
                ]
            });
            oFileUploader.attachChange(() => {
                if (!selectedFile) return;
                var reader = new FileReader();
                reader.onload = e => {
                    var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
                    var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                    rows.forEach(r => r.selected = false);
                    oExcelTable = new sap.m.Table({ width: "100%", columns: ["Select","Service No","Description","Quantity","UOM","Formula","Currency","Amount Per Unit","Total"].map(t => new sap.m.Column({ header: new sap.m.Text({ text: t }) })) });
                    oExcelTable.setModel(new sap.ui.model.json.JSONModel({ rows }));
                    oExcelTable.bindItems({ path: "/rows", template: new sap.m.ColumnListItem({ type: "Inactive", cells: [new sap.m.CheckBox({ selected: "{selected}" }), new sap.m.Text({ text: "{Service No}" }), new sap.m.Text({ text: "{Description}" }), new sap.m.Text({ text: "{Quantity}" }), new sap.m.Text({ text: "{UOM}" }), new sap.m.Text({ text: "{Formula}" }), new sap.m.Text({ text: "{Currency}" }), new sap.m.Text({ text: "{Amount Per Unit}" }), new sap.m.Text({ text: "{Total}" })] }) });
                    oDialogContent.addItem(oExcelTable);
                };
                reader.readAsArrayBuffer(selectedFile);
            });
            oExcelDialog.open();
        },

        onFileChange: function (oEvent) {
            var oFile = oEvent.getSource().$().find('input[type="file"]')[0]?.files[0];
            if (!oFile || !oFile.name.endsWith('.xlsx')) { MessageToast.show("Please select a valid .xlsx file."); return; }
            var oReader = new FileReader();
            oReader.onload = e => {
                var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                var aData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
                if (aData.length < 2) { MessageToast.show("Excel file is empty."); return; }
                var aH = aData[0];
                var aReq = ["Service No","Description","Quantity","UOM","Amount Per Unit","Currency"];
                if (!aReq.every(h => aH.includes(h))) { MessageToast.show("Excel must have headers: " + aReq.join(", ")); return; }
                var aRows = aData.slice(1).map(aRow => {
                    var oRow = {}; aH.forEach((h, i) => oRow[h] = aRow[i] || "");
                    var qty = parseFloat(oRow.Quantity) || 0, amt = parseFloat(oRow["Amount Per Unit"]) || 0;
                    return { serviceNumberCode: oRow["Service No"], description: oRow.Description, quantity: qty.toFixed(3), unitOfMeasurementCode: oRow.UOM, amountPerUnit: amt.toFixed(3), total: (qty*amt).toFixed(3), totalWithProfit: (qty*amt).toFixed(3), amountPerUnitWithProfit: amt.toFixed(3), currencyCode: oRow.Currency, formulaCode: "", profitMargin: "0", subItemList: [] };
                }).filter(r => r.description.trim() && r.quantity > 0);
                if (!aRows.length) { MessageToast.show("No valid rows to import."); return; }
                var oModel = this.getView().getModel();
                oModel.setProperty("/importRows", aRows);
                oModel.setProperty("/importReady", true);
                this.byId("importStatus").setText(aRows.length + " valid rows ready to import.");
            };
            oReader.readAsArrayBuffer(oFile);
        },

        onImportData: function () {
            var oModel = this.getView().getModel();
            var aItems = (oModel.getProperty("/MainItems") || []).concat(oModel.getProperty("/importRows") || []);
            oModel.setProperty("/MainItems", aItems);
            this._recalculateTotalValue();
            oModel.refresh(true);
            this.onCloseImportDialog();
            MessageToast.show("Items imported successfully!");
        },

        onExport: function () {
            var aData = this._flattenDataForExport();
            if (!aData.length) { MessageToast.show("No data to export."); return; }
            var aH = Object.keys(aData[0]);
            var oWB = XLSX.utils.book_new();
            var oWS = XLSX.utils.aoa_to_sheet([aH].concat(aData.map(r => aH.map(k => r[k]))));
            XLSX.utils.book_append_sheet(oWB, oWS, "Tendering Items");
            XLSX.writeFile(oWB, "Tendering_Export_" + new Date().toISOString().slice(0,10) + ".xlsx");
            MessageToast.show(aData.length + " rows exported.");
            this.onCloseExportDialog();
        },

        onExportPDF: function () {
            var aData = this._flattenDataForExport();
            if (!aData.length) { MessageToast.show("No data to export."); return; }
            var aH = Object.keys(aData[0]);
            var oDoc = new window.jspdf.jsPDF('l','mm','a4');
            oDoc.text("Tendering Items Export - " + new Date().toLocaleDateString(), 14, 20);
            oDoc.autoTable({ head: [aH], body: aData.map(r => aH.map(k => r[k])), startY: 30, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [41,128,185], textColor: 255 }, margin: { top: 30, left: 10, right: 10 } });
            oDoc.text("Total Value: " + (this.getView().getModel().getProperty("/totalValue") || 0) + " SAR", 14, oDoc.lastAutoTable.finalY + 10);
            oDoc.save("Tendering_Export_" + new Date().toISOString().slice(0,10) + ".pdf");
            MessageToast.show(aData.length + " rows exported to PDF.");
            this.onCloseExportDialog();
        },

        _flattenDataForExport: function () {
            return (this.getView().getModel().getProperty("/MainItems") || []).map(m => ({
                "Type": "Main", "Service No": m.serviceNumberCode || "", "Description": m.description || "",
                "Quantity": m.quantity || "0", "UOM": m.unitOfMeasurementCode || "", "Formula": m.formulaCode || "",
                "Currency": m.currencyCode || "", "Amount Per Unit": m.amountPerUnit || "0",
                "Total": m.total || "0", "Profit Margin": m.profitMargin || "0",
                "Amount Per Unit with Profit": m.amountPerUnitWithProfit || "0",
                "Total with Profit": m.totalWithProfit || "0"
            }));
        },

        onCloseImportDialog: function () {
            this.byId("importDialog").close();
            var oModel = this.getView().getModel();
            oModel.setProperty("/importReady", false);
            oModel.setProperty("/importRows", []);
            this.byId("importStatus").setText("");
        },

        onCancelSubDialog: function () { this.byId("addSubDialog").close(); },

        onCollapseAll: function () { try { this.byId("treeTable").collapseAll(); } catch(e) { console.error(e); } },
        onCollapseSelection: function () {
            try {
                var oT = this.byId("treeTable");
                var aIdx = oT.getSelectedIndices().filter(i => i >= 0);
                if (!aIdx.length) { MessageToast.show("Please select rows to collapse."); return; }
                oT.collapse(aIdx);
            } catch(e) { console.error(e); }
        },
        onExpandFirstLevel: function () { try { this.byId("treeTable").expandToLevel(1); } catch(e) { console.error(e); } },
        onExpandSelection: function () {
            try {
                var oT = this.byId("treeTable");
                var aIdx = oT.getSelectedIndices().filter(i => i >= 0);
                if (!aIdx.length) { MessageToast.show("Please select rows to expand."); return; }
                oT.expand(aIdx);
            } catch(e) { console.error(e); }
        },

        onCloseDialog: function (oEvent) { oEvent.getSource().getParent().close(); },
        onCloseMainItemDialog: function () { this.byId("addMainItemDialog").close(); },
        onCloseExportDialog: function () { this.byId("exportChoiceDialog").close(); },
        onPrint: function () { MessageToast.show("Print not implemented yet."); }
    });
});