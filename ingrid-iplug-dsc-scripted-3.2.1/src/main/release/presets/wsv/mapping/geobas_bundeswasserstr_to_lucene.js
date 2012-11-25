/**
 * SourceRecord to Lucene Document mapping
 * Copyright (c) 2011 wemove digital solutions. All rights reserved.
 *
 * The following global variable are passed from the application:
 *
 * @param sourceRecord A SourceRecord instance, that defines the input
 * @param luceneDoc A lucene Document instance, that defines the output
 * @param log A Log instance
 * @param SQL SQL helper class encapsulating utility methods
 * @param IDX Lucene index helper class encapsulating utility methods for output
 * @param TRANSF Helper class for transforming, processing values/fields.
 */
importPackage(Packages.org.apache.lucene.document);
importPackage(Packages.de.ingrid.iplug.dsc.om);
importPackage(Packages.de.ingrid.geo.utils.transformation);

if (log.isDebugEnabled()) {
	log.debug("Mapping source record to lucene document: " + sourceRecord.toString());
}

if (!(sourceRecord instanceof DatabaseSourceRecord)) {
    throw new IllegalArgumentException("Record is no DatabaseRecord!");
}

// ---------- bundeswasserstr ----------
var objId = sourceRecord.get(DatabaseSourceRecord.ID);
var objRows = SQL.all("SELECT * FROM bundeswasserstr WHERE id=?", [objId]);
for (i=0; i<objRows.size(); i++) {
/*
    // Example iterating all columns !
    var objRow = objRows.get(i);
    var colNames = objRow.keySet().toArray();
    for (var i in colNames) {
        var colName = colNames[i];
        IDX.add(colName, objRow.get(colName));
	}
*/
    addBundeswasserstr(objRows.get(i));
}

function addBundeswasserstr(row) {
    IDX.add("bundeswasserstr.id", row.get("id"));
    IDX.add("bundeswasserstr.kurzbezeichnung", row.get("kurzbezeichnung"));
    IDX.add("bundeswasserstr.name", row.get("name"));
    IDX.add("title", "Bundeswasserstr: " + row.get("name"));
    IDX.add("summary", "Stammdaten: " + row.get("name") + ", " + row.get("kurzbezeichnung"));
}

function hasValue(val) {
    if (typeof val == "undefined") {
        return false; 
    } else if (val == null) {
        return false; 
    } else if (typeof val == "string" && val == "") {
        return false;
    } else if (typeof val == "object" && val.toString().equals("")) {
        return false;
    } else {
      return true;
    }
}
