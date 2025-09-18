sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
], (Controller, MessageBox) => {
    "use strict";

    return Controller.extend("project1.controller.FileUpload", {
        onInit() {
            this.getOwnerComponent().getRouter().getRoute("RouteFileUpload").attachPatternMatched(this._onRouteMatched, this);
        },

        // _onRouteMatched: function (oEvent) {
        //     const packingSiteId = oEvent.getParameter("arguments").packingSiteId;
        //     this._packingSiteId = packingSiteId;
        // },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments") || {};
            var oQuery = oArgs["?query"] || {};
            var sPackingSite = oQuery.packingSiteId || "";
            this._packingSiteId = sPackingSite;
        },

        onDownloadSample: function () {
            var sUrl = jQuery.sap.getModulePath("project1", "/files/Sample.xlsx");
            var link = document.createElement("a");
            link.href = sUrl;
            link.download = "Packaging Information Sample.xlsx";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        onFileUpload: async function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) {
                return sap.m.MessageToast.show("Please select a file");
            }

            const that = this;
            const fileName = oFile.name.toLowerCase();
            const isExcel = fileName.endsWith(".xls") || fileName.endsWith(".xlsx");
            if (!isExcel) {
                return sap.m.MessageBox.error("Only Excel files (.xls, .xlsx) are supported. Please upload a valid Excel file.");
            }

            let csvText = "";
            try {
                csvText = await this._convertExcelToCsvOnServer(oFile);
            } catch (err) {
                return sap.m.MessageBox.error("Failed to read or convert the Excel file. Please check the file format.");
            }

            // --- CSV Parsing Logic (robust) ---
            const parseCSV = (csv) => {
                const rows = [];
                let cur = "", inQuotes = false;
                for (let i = 0; i < csv.length; i++) {
                    const ch = csv[i], next = csv[i + 1];
                    if (ch === '"') {
                        if (inQuotes && next === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
                    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
                        if (cur !== "") { rows.push(cur); cur = ""; }
                        if (ch === '\r' && next === '\n') i++;
                    } else {
                        cur += ch;
                    }
                }
                if (cur !== "") rows.push(cur);

                const splitLine = (line) => {
                    const cells = [];
                    let val = "", quoted = false;
                    for (let i = 0; i < line.length; i++) {
                        const ch = line[i], next = line[i + 1];
                        if (ch === '"') {
                            if (quoted && next === '"') { val += '"'; i++; } else { quoted = !quoted; }
                        } else if (ch === ',' && !quoted) {
                            cells.push(val); val = "";
                        } else { val += ch; }
                    }
                    cells.push(val);
                    return cells.map(v => v.replace(/\r?\n/g, " ").replace(/^"|"$/g, "").trim());
                };

                const matrix = rows.map(splitLine).filter(r => r.length > 0);
                if (matrix.length === 0) return [];

                let headers = matrix[0].map((h, idx) => idx === 0 ? h.replace(/^\uFEFF/, "") : h);
                const dataRows = matrix.slice(1);

                const records = dataRows.map(arr => {
                    const obj = {};
                    headers.forEach((h, i) => obj[h] = (arr[i] ?? "").trim());
                    return obj;
                });

                const junkRowRegex = /(^|,)\s*(packing site id\b|release date\b|comments\b)/i;
                const cleaned = records.filter(r => {
                    const vals = Object.values(r).map(v => (v ?? "").trim());
                    const allEmpty = vals.every(v => !v);
                    const joined = vals.join(",");
                    const looksLikeHeaderChunk = joined.startsWith(",") && junkRowRegex.test(joined);
                    return !(allEmpty || looksLikeHeaderChunk);
                });

                return cleaned;
            };

            let jsonData;
            try { jsonData = parseCSV(csvText); }
            catch (err) {
                return sap.m.MessageBox.error("Failed to parse the Excel file. Please check the file structure.");
            }

            if (!jsonData || jsonData.length === 0) {
                return sap.m.MessageBox.error("The Excel file must contain at least one row of data.");
            }

            if (jsonData.length > 2500) {
                return sap.m.MessageBox.error(`You can upload a maximum of 2,500 rows at a time. Your file has ${jsonData.length}. Please split the file and try again.`);
            }

            // --- Date Formatting ---
            const formatExcelDate = (val) => {
                if (val == null) return "";
                let s = String(val).trim();
                if (!s) return "";

                const ddmmyyyySlash = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
                const ddmmyyyyDash = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/;
                const isoYMD = /^(\d{4})-(\d{2})-(\d{2})(?:\s+\d{2}:\d{2}:\d{2})?$/;

                if (ddmmyyyySlash.test(s)) return s;

                if (ddmmyyyyDash.test(s)) {
                    const [d, m, y] = s.split("-");
                    return `${d}/${m}/${y}`;
                }

                const mIso = s.match(isoYMD);
                if (mIso) {
                    const [, y, m, d] = mIso;
                    return `${d}/${m}/${y}`;
                }

                if (!isNaN(s) && Number.isFinite(+s)) {
                    const n = parseInt(s, 10);
                    if (n > 59 && n < 60000) {
                        const excelEpoch = new Date(1899, 11, 30);
                        const date = new Date(excelEpoch.getTime() + n * 86400000);
                        const dd = String(date.getDate()).padStart(2, "0");
                        const mm = String(date.getMonth() + 1).padStart(2, "0");
                        const yyyy = date.getFullYear();
                        return `${dd}/${mm}/${yyyy}`;
                    }
                }
                return s;
            };

            jsonData.forEach((row) => {
                row["Packaging Date"] = formatExcelDate(row["Packaging Date"]);
                row["Release Date"] = formatExcelDate(row["Release Date"]);
                row["Packaging Site ID -Name"] = this._packingSiteId;
                // if (!row["Packing Site ID -Name"] && this._packingSiteId) {
                //     row["Packing Site ID -Name"] = this._packingSiteId;
                // }
                if (row["Comments"] == null) row["Comments"] = "";
            });

            // --- Initialize Error column ---
            jsonData.forEach(row => { if (row["Error"] == null) row["Error"] = ""; });

            // --- Validate required columns (Comments optional) ---
            const aRequiredColumns = [
                "Batch No.", "Component Code for packaging site", "Packaging Site ID -Name",
                "Packaging Date", "Release Date"
            ];
            const aColumns = Object.keys(jsonData[0] || {}).map(this._normalize);
            const aMissing = aRequiredColumns.filter(col => !aColumns.includes(this._normalize(col)));
            if (aMissing.length) {
                return sap.m.MessageBox.error(
                    `Missing mandatory columns: ${aMissing.join(", ")}. Please check your Excel file headers.`
                );
            }

            // --- Per-row validation (existing) ---
            const datePattern = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
            jsonData.forEach((row) => {
                let errorMessage = "";
                if (!row["Batch No."] || row["Batch No."].trim() === "") {
                    errorMessage += "Batch No. is missing. ";
                }
                if (!row["Component Code for packaging site"] || row["Component Code for packaging site"].trim() === "") {
                    errorMessage += "Component Code for packaging site is missing. ";
                }
                if (!datePattern.test(row["Packaging Date"])) {
                    errorMessage += "Packaging Date is invalid. ";
                }
                if (!datePattern.test(row["Release Date"])) {
                    errorMessage += "Release Date is invalid. ";
                }

                if (errorMessage) row["Error"] = (row["Error"] ? row["Error"] + " " : "") + errorMessage.trim();
            });

            // --- NEW: Duplicate-row validation ---
            // If (Batch No., Component Code, Packing Site ID -Name, Comments) are ALL the same → error.
            const seen = new Map(); // key -> first index
            const norm = v => (v == null ? "" : String(v).trim().toLowerCase());

            jsonData.forEach((row, idx) => {
                const bn = norm(row["Batch No."]);
                const cc = norm(row["Component Code for packaging site"]);
                const ps = norm(row["Packaging Site ID -Name"]);
                const cm = norm(row["Comments"]); // comments can be empty; equality still matters

                // Require the 3 primary fields; if any missing, skip duplicate check
                if (!bn || !cc || !ps) return;

                const key = [bn, cc, ps, cm].join("|");

                if (seen.has(key)) {
                    const firstIdx = seen.get(key);
                    const dupMsg = "Duplicate row (same Batch No., Component Code for packaging site, Packaging Site ID -Name, and Comments).";
                    jsonData[idx]["Error"] = (jsonData[idx]["Error"] ? jsonData[idx]["Error"] + " " : "") + dupMsg;
                    jsonData[firstIdx]["Error"] = (jsonData[firstIdx]["Error"] ? jsonData[firstIdx]["Error"] + " " : "") + dupMsg;
                } else {
                    seen.set(key, idx);
                }
            });

            // --- Bind to table ---
            const oModel = new sap.ui.model.json.JSONModel({ data: jsonData });
            that.getView().setModel(oModel, "excelModel");
            oModel.attachPropertyChange(() => this._updateSubmitState());
            that._createTableColumns(jsonData);
            sap.m.MessageToast.show("Excel file uploaded successfully!");
        },


        _normalize: function (str) {
            return (str || "")
                .toLowerCase()
                .replace(/\./g, "")        // remove dots
                .replace(/\s*-\s*/g, "-")  // normalize spaces around hyphens
                .replace(/\s+/g, " ")
                .trim();
        },

        _updateSubmitState: function () {
            const oModel = this.getView().getModel("excelModel");
            const data = (oModel && oModel.getProperty("/data")) || [];
            const hasData = Array.isArray(data) && data.length > 0;
            const hasErrors = hasData && data.some(r => (String((r && r.Error) || "").trim().length > 0));

            const btn = this.byId("submitBtn");
            if (btn) {
                btn.setEnabled(hasData && !hasErrors);
                // console.log("Submit enabled?", hasData && !hasErrors, { hasData, hasErrors });
            }
            const dl = this.byId("downloadexcel");
            if (dl) dl.setEnabled(false);
        },



        _convertExcelToCsvOnServer: async function (file) {
            const sServiceUrl = this.getView().getModel().sServiceUrl;
            const url = sServiceUrl + "convertExcelToCsv";

            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]); // Remove data URI prefix
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const payload = {
                file: base64 // Send Base64 string
            };

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Conversion failed");
            const json = await res.json();
            return json.csvText;
        },

        onReset: function () {
            var oFileUploader = this.byId("fileUploader");
            if (oFileUploader) {
                oFileUploader.clear();
            }

            var oTable = this.byId("excelTable");
            if (oTable) {
                oTable.removeAllColumns();
            }

            this.getView().setModel(new sap.ui.model.json.JSONModel({ data: [] }), "excelModel");
            this._updateSubmitState();
            // this.byId("submitBtn").setEnabled(false);
            // this.byId("downloadexcel").setEnabled(false);
            sap.m.MessageToast.show("Page reset successfully!");
        },

        _createTableColumns: function (jsonData) {
            const columnOrder = [
                "Batch No.",
                "Component Code for packaging site",
                "Packaging Site ID -Name",
                "Packaging Date",
                "Release Date",
                "Comments",
                "Error"
            ];
            // adj column from here 
            const widthByCol = {
                "Batch No.": "90px",
                "Component Code for packaging site": "120px",
                "Packaging Site ID -Name": "200px",
                "Packaging Date": "120px",
                "Release Date": "120px",
                "Comments": "150px",
                "Error": "200px"
            };

            jsonData = jsonData.filter(r =>
                Object.values(r).some(v => (v ?? "").toString().trim() !== "")
            );

            jsonData.forEach(r => {
                r["Comments"] = r["Comments"] ?? "";
                r["Error"] = r["Error"] ?? "";
            });

            const oTable = this.byId("excelTable");
            oTable.removeAllColumns();
            if (!jsonData?.length) return;

            // --- Add Action column FIRST ---
            oTable.addColumn(new sap.ui.table.Column({
                // label optional, sirf icon dikhana..
                template: new sap.m.Button({
                    text: "",
                    icon: "sap-icon://edit",
                    type: "Transparent",
                    visible: {
                        path: "excelModel>Error",
                        formatter: function (v) {
                            return !!(v && v.trim()); // only show if error exists
                        }
                    },
                    press: (oEvent) => {
                        const rowContext = oEvent.getSource().getBindingContext("excelModel");
                        this._onEditRow(rowContext);
                    }
                }),
                width: "50px" //  icon column
            }));






            // --- Then add the rest of the columns ---
            columnOrder.forEach(col => {
                oTable.addColumn(new sap.ui.table.Column({
                    label: new sap.m.Label({
                        text: col,
                        wrapping: true,
                        design: "Bold",
                        width: widthByCol[col] || "150px"
                    }),
                    template: col === "Error"
                        ? new sap.m.Text({
                            text: `{excelModel>${col}}`,
                            wrapping: true,
                            color: {
                                path: `excelModel>${col}`,
                                formatter: function (v) { return v && v.trim() !== "" ? "red" : "inherit"; }
                            },
                            tooltip: `{excelModel>${col}}`
                        })
                        : new sap.m.Text({ text: `{excelModel>${col}}`, wrapping: true }),
                    sortProperty: col,
                    filterProperty: col,
                    width: widthByCol[col] || "150px",
                    hAlign: "Left"
                }));
            });







            // --- Row Settings ---
            const oRowSettingsTemplate = new sap.ui.table.RowSettings({
                highlight: {
                    path: "excelModel>Error",
                    formatter: function (sError) {
                        return sError && sError.trim() !== "" ? "Error" : "None";
                    }
                },
                highlightText: {
                    path: "excelModel>Error",
                    formatter: function (sError) {
                        return sError && sError.trim() !== "" ? "Error in row" : "";
                    }
                }
            });

            oTable.setRowSettingsTemplate(oRowSettingsTemplate);


            // bind data
            this.getView().getModel("excelModel").setData({ data: jsonData });
            this._updateSubmitState();
        },
// edit row logic//
       
// edit row logic
_onEditRow: function (oContext) {
    const rowData = oContext.getObject();

    if (!this._editDialog) {
        this._editDialog = new sap.m.Dialog({
            title: "Edit Row",
            contentWidth: "500px",
            resizable: true,
            draggable: true,
            content: new sap.ui.layout.form.SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanM: 4,
                labelSpanL: 3,
                emptySpanL: 1,
                emptySpanM: 1,
                columnsM: 2,
                adjustLabelSpan: false,

                content: [
                    new sap.m.Label({ text: "Batch No." }),
                    new sap.m.Input({ value: "{excelModel>Batch No.}" }),

                    new sap.m.Label({ text: "Component Code" }),
                    new sap.m.Input({ value: "{excelModel>Component Code for packaging site}" }),

                    new sap.m.Label({ text: "Packaging Date" }),
                    new sap.m.DatePicker({
                        value: {
                            path: "excelModel>Packaging Date",
                            type: new sap.ui.model.type.Date({
                                pattern: "dd/MM/yyyy",
                                strictParsing: true
                            })
                        },
                        displayFormat: "dd/MM/yyyy",
                        valueFormat: "dd/MM/yyyy"
                    }),

                    new sap.m.Label({ text: "Release Date" }),
                    new sap.m.DatePicker({
                        value: {
                            path: "excelModel>Release Date",
                            type: new sap.ui.model.type.Date({
                                pattern: "dd/MM/yyyy",
                                strictParsing: true
                            })
                        },
                        displayFormat: "dd/MM/yyyy",
                        valueFormat: "dd/MM/yyyy"
                    }),

                    new sap.m.Label({ text: "Comments" }),
                    new sap.m.Input({ value: "{excelModel>Comments}" })
                ]
            }),
            beginButton: new sap.m.Button({
                text: "Save",
                press: () => {
                    const oModel = oContext.getModel();
                    const row = oContext.getObject();

                    // ---- Always reset error first ----
                    row["Error"] = "";

                    // --- Normalize Dates ---
                    const normalizeDate = (val) => {
                        if (!val) return "";

                        // Agar Date object hai
                        if (val instanceof Date) {
                            return sap.ui.core.format.DateFormat.getDateInstance({
                                pattern: "dd/MM/yyyy"
                            }).format(val);
                        }

                        // Agar string hai aur dd/MM/yyyy me hai
                        const ddmmyyyy = /^\d{2}\/\d{2}\/\d{4}$/;
                        if (typeof val === "string" && ddmmyyyy.test(val)) {
                            return val;
                        }

                        // Agar string hai but alag format me
                        const parsed = new Date(val);
                        if (!isNaN(parsed)) {
                            return sap.ui.core.format.DateFormat.getDateInstance({
                                pattern: "dd/MM/yyyy"
                            }).format(parsed);
                        }

                        return "";
                    };

                    row["Packaging Date"] = normalizeDate(row["Packaging Date"]);
                    row["Release Date"]   = normalizeDate(row["Release Date"]);

                    // --- Validation ---
                    let errorMsg = [];
                    const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

                    if (!row["Batch No."] || String(row["Batch No."]).trim() === "") {
                        errorMsg.push("Batch No. is missing");
                    }
                    if (!row["Component Code for packaging site"] || String(row["Component Code for packaging site"]).trim() === "") {
                        errorMsg.push("Component Code is missing");
                    }
                    if (!datePattern.test(row["Packaging Date"])) {
                        errorMsg.push("Packaging Date invalid (dd/MM/yyyy)");
                    }
                    if (!datePattern.test(row["Release Date"])) {
                        errorMsg.push("Release Date invalid (dd/MM/yyyy)");
                    }

                    // Set fresh error message
                    row["Error"] = errorMsg.join(" | ");

                    oModel.refresh(true); // refresh binding

                    if (!row["Error"]) {
                        sap.m.MessageToast.show("Row updated successfully ✅");
                    } else {
                        sap.m.MessageToast.show("Row still has errors ⚠️");
                    }

                    this._editDialog.close();
                    this._updateSubmitState();
                }
            }),
            endButton: new sap.m.Button({
                text: "Cancel",
                press: () => this._editDialog.close()
            })
        });

        this.getView().addDependent(this._editDialog);
    }

    // ---- Clear error when opening dialog for a new row ----
    const row = oContext.getObject();
    row["Error"] = "";
    oContext.getModel().refresh(true);

    this._editDialog.setBindingContext(oContext, "excelModel");
    this._editDialog.open();
}


    });
}); 