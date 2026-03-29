sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("project1.controller.View1", {
        onInit() {
        },
        onNavigateToServiceType() {
            this.getOwnerComponent().getRouter().navTo("serviceType");
        },
        onNavigateToServiceMaster() {
            this.getOwnerComponent().getRouter().navTo("serviceMaster");
        },
        onNavigateToModel() {
            this.getOwnerComponent().getRouter().navTo("model");
        },
        onNavigateToFormula() {
            this.getOwnerComponent().getRouter().navTo("formulas");
        },
         onNavigateToExample() {
            this.getOwnerComponent().getRouter().navTo("example");
        }

    });
});