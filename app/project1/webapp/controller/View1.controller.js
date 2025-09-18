sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("project1.controller.View1", {
        onInit() {
                var oModel = new sap.ui.model.json.JSONModel({
                packingSites: [
                    { name: "Mylan Hungary Kft (Komarom - HU)", id: "77260" },
                    { name: "Mylan Laboratories Ltd (Nashik - IN)", id: "12664" },
                    { name: "Pharmathen Pharmaceutical SA (Pallini - GR)", id: "33033" },
                    { name: "MITIM Srl (Brescia - IT)", id: "56723" },
                    { name: "Merckle GmbH (Ulm - DE)", id: "92638" },
                    { name: "Balkanpharma-Dupnitsa AD (Dupnitsa - BG)", id: "64845" }
                ]
            });
            this.getView().setModel(oModel, "packingSiteModel");
            this.getOwnerComponent().getRouter().getRoute("RouteView1").attachPatternMatched(this._onRouteMatched, this);
            this.getView().byId("continue").setEnabled(false);
            this._packingSiteId = "";
        },
           onInputChange(oEvent) {
            const sValue = oEvent.getParameter("value");
            const oButton = this.getView().byId("continue");
            oButton.setEnabled(!!sValue.trim()); // Enable if input has value
            this._packingSiteId = sValue;
        },

        onContinuePress: function () {
            var sPackingSite = this.byId("packingSiteInput").getValue();
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteFileUpload", {
                query: {
                    packingSiteId: sPackingSite
                }
            });

        },
        onValueHelpRequest: function () {
            if (!this._oValueHelpDialog) {
                this._oValueHelpDialog = sap.ui.xmlfragment("project1.fragment.PackingSiteHelp", this);
                this.getView().addDependent(this._oValueHelpDialog);
            }
            this._oValueHelpDialog.open();
        },

        onPackingSiteSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oFilter = new sap.ui.model.Filter({
                filters: [
                    new sap.ui.model.Filter("name", sap.ui.model.FilterOperator.Contains, sValue),
                    new sap.ui.model.Filter("id", sap.ui.model.FilterOperator.Contains, sValue)
                ],
                and: false
            });

            oEvent.getSource().getBinding("items").filter(oFilter);
        },

        onPackingSiteSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sTitle = oSelectedItem.getTitle();         // ID
                var sDesc = oSelectedItem.getDescription();    // Name

                // Combine ID and Name
                var sValue = `${sTitle} - ${sDesc}`;

                // Set full value in the input
                this.byId("packingSiteInput").setValue(sValue);

                // Enable the Continue button
                const oButton = this.getView().byId("continue");
                oButton.setEnabled(!!sValue.trim());
            }
        },

        onPackingSiteCancel: function () {
            this._oValueHelpDialog.close();
        }
    });
});