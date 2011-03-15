/**
 * SourceRecord to IDF Document mapping
 * Copyright (c) 2011 wemove digital solutions. All rights reserved.
 *
 * The following global variable are passed from the application:
 *
 * @param sourceRecord A SourceRecord instance, that defines the input
 * @param idfDoc A IDF Document (XML-DOM) instance, that defines the output
 * @param log A Log instance
 * @param SQL SQL helper class encapsulating utility methods
 * @param XPATH xpath helper class encapsulating utility methods
 * @param TRANSF Helper class for transforming, processing values
 * @param DOM Helper class encapsulating processing DOM
 */
importPackage(Packages.org.w3c.dom);
importPackage(Packages.de.ingrid.iplug.dsc.om);

if (log.isDebugEnabled()) {
	log.debug("Mapping source record to idf document: " + sourceRecord.toString());
}

if (!(sourceRecord instanceof DatabaseSourceRecord)) {
    throw new IllegalArgumentException("Record is no DatabaseRecord!");
}
// ---------- Initialize ----------
// add Namespaces to Utility for convenient handling of NS !
DOM.addNS("gmd", "http://www.isotc211.org/2005/gmd");
DOM.addNS("gco", "http://www.isotc211.org/2005/gco");
DOM.addNS("srv", "http://www.isotc211.org/2005/srv");
DOM.addNS("gml", "http://www.opengis.net/gml");
DOM.addNS("gts", "http://www.isotc211.org/2005/gts");
DOM.addNS("xlink", "http://www.w3.org/1999/xlink");

// ---------- <idf:body> ----------
var idfBody = XPATH.getNode(idfDoc, "/idf:html/idf:body");

// ---------- <gmd:MD_Metadata> ----------
var gmdMetadata = DOM.addElement(idfBody, "gmd:MD_Metadata");
// add known namespaces
gmdMetadata.addAttribute("xmlns:gmd", DOM.getNS("gmd"));
gmdMetadata.addAttribute("xmlns:gco", DOM.getNS("gco"));
gmdMetadata.addAttribute("xmlns:srv", DOM.getNS("srv"));
gmdMetadata.addAttribute("xmlns:gml", DOM.getNS("gml"));
gmdMetadata.addAttribute("xmlns:gts", DOM.getNS("gts"));
gmdMetadata.addAttribute("xmlns:xlink", DOM.getNS("xlink"));
// and schema references
gmdMetadata.addAttribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");
gmdMetadata.addAttribute("xsi:schemaLocation", DOM.getNS("gmd") + " http://schemas.opengis.net/iso/19139/20060504/gmd/gmd.xsd");

// ========== t01_object ==========
var objId = sourceRecord.get(DatabaseSourceRecord.ID);
var objRows = SQL.all("SELECT * FROM t01_object WHERE id=?", [objId]);
for (i=0; i<objRows.size(); i++) {
    var objRow = objRows.get(i);
    var objUuid = objRow.get("obj_uuid");
    var objClass = objRow.get("obj_class");
    var objParentUuid = null; // will be set below
    
    // local variables
    var row = null;
    var rows = null;
    var value = null;
    var elem = null;
/*
    // Example iterating all columns !
    var colNames = objRow.keySet().toArray();
    for (var i in colNames) {
        var colName = colNames[i];
        var colValue = objRow.get(colName);
    }
*/

// ---------- <gmd:fileIdentifier> ----------
    value = getFileIdentifier(objRow);
    if (hasValue(value)) {
    	gmdMetadata.addElement("gmd:fileIdentifier/gco:CharacterString").addText(value);
    }

// ---------- <gmd:language> ----------
    value = TRANSF.getLanguageISO639_2FromIGCCode(objRow.get("metadata_language_key"));
    if (hasValue(value)) {
    	gmdMetadata.addElement("gmd:language/gmd:LanguageCode")
    		.addAttribute("codeList", "http://www.loc.gov/standards/iso639-2/")
    		.addAttribute("codeListValue", value).addText(value);
    }
// ---------- <gmd:characterSet> ----------
    value = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(510, objRow.get("metadata_character_set"));
    if (hasValue(value)) {
    	gmdMetadata.addElement("gmd:characterSet/gmd:MD_CharacterSetCode")
    		.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#MD_CharacterSetCode")
    		.addAttribute("codeListValue", value);
    }
// ---------- <gmd:parentIdentifier> ----------
    // NOTICE: Has to be published ! Guaranteed by select of passed sourceRecord ! 
    rows = SQL.all("SELECT fk_obj_uuid FROM object_node WHERE obj_uuid=?", [objUuid]);
    // Should be only one row !
    objParentUuid = rows.get(0).get("fk_obj_uuid");
    if (hasValue(objParentUuid)) {
    	gmdMetadata.addElement("gmd:parentIdentifier/gco:CharacterString").addText(objParentUuid);
    }
// ---------- <gmd:hierarchyLevel> ----------
// ---------- <gmd:hierarchyLevelName> ----------
    var hierarchyLevel = getHierarchLevel(objClass);
    var hierarchyLevelName = map(objClass, {"0":"job", "1":"", "2":"document", "3":"service", "4":"project", "5":"database", "6":"application"});
    if (hasValue(hierarchyLevel)) {
    	gmdMetadata.addElement("gmd:hierarchyLevel/gmd:MD_ScopeCode")
    		.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#MD_ScopeCode")
    		.addAttribute("codeListValue", hierarchyLevel).addText(hierarchyLevel);
    }
    if (hasValue(hierarchyLevelName)) {
    	gmdMetadata.addElement("gmd:hierarchyLevelName/gco:CharacterString").addText(hierarchyLevelName);
    }
    // ---------- <gmd:contact> ----------
    var addressRows = SQL.all("SELECT t02_address.*, t012_obj_adr.type FROM t012_obj_adr, t02_address WHERE t012_obj_adr.adr_uuid=t02_address.adr_uuid AND t02_address.work_state=? AND t012_obj_adr.obj_id=? AND t012_obj_adr.type=? ORDER BY line", ['V', objId, 7]);
    for (var i=0; i< addressRows.size(); i++) {
    	var addressRow = addressRows.get(i); 
    	var role = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(505, addressRow.get("type"));
    	if (hasValue(role)) {
    		gmdMetadata.addElement("gmd:contact").addElement(getCiResponsibleParty(addressRow, role));
    	}
    }
    // ---------- <gmd:dateStamp> ----------
    if (hasValue(objRow.get("mod_time"))) {
    	var isoDate = TRANSF.getISODateFromIgcDate(objRow.get("mod_time"));
       	// do only return the date section, ignore the time part of the date
    	// see CSW 2.0.2 AP ISO 1.0 (p.41)
		if (isoDate.indexOf('T') > -1) {
			isoDate = isoDate.substring(0, isoDate.indexOf('T'));
		}
    	gmdMetadata.addElement("gmd:dateStamp").addElement("gco:Date").addText(isoDate);
    }
    
    // ---------- <gmd:metadataStandardName> ----------
    var mdStandardName;
    if (hasValue(objRow.get("metadata_standard_name"))) {
    	mdStandardName=objRow.get("metadata_standard_name");
    } else if (objClass.equals("3") || objClass.equals("6")) {
    	mdStandardName="ISO19119";
    } else {
    	mdStandardName="ISO19115";
    }
	gmdMetadata.addElement("gmd:metadataStandardName/gco:CharacterString").addText(mdStandardName);

    // ---------- <gmd:metadataStandardVersion> ----------
    var mdStandardName;
    if (hasValue(objRow.get("metadata_standard_version"))) {
    	mdStandardName=objRow.get("metadata_standard_version");
    } else if (objClass.equals("3") || objClass.equals("6")) {
    	mdStandardName="2005/PDAM 1";
    } else {
    	mdStandardName="2003/Cor.1:2006";
    }
	gmdMetadata.addElement("gmd:metadataStandardVersion/gco:CharacterString").addText(mdStandardName);

    // ---------- <gmd:topologyLevel> ----------
	var objGeoRow = SQL.first("SELECT * FROM t011_obj_geo WHERE obj_id=?", [objId]);
	if (hasValue(objGeoRow)) {
		var mdVectorSpatialRepresentation;
		var vectorTopologyLevel = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(528, objGeoRow.get("vector_topology_level"));
		if (hasValue(vectorTopologyLevel)) {
			if (!mdVectorSpatialRepresentation) mdVectorSpatialRepresentation = gmdMetadata.addElement("gmd:spatialRepresentationInfo/gmd:MD_VectorSpatialRepresentation");
			mdVectorSpatialRepresentation.addElement("gmd:topologyLevel/gmd:MD_TopologyLevelCode")
				.addAttribute("codeList","http://www.tc211.org/ISO19139/resources/codeList.xml#MD_TopologyLevelCode")
				.addAttribute("codeListValue", vectorTopologyLevel);
		}
		
		// ---------- <gmd:MD_GeometricObjects> ----------
		var objGeoVectorRows = SQL.all("SELECT * FROM t011_obj_geo_vector WHERE obj_geo_id=?", [objGeoRow.get("id")]);
		for (var j=0; j<objGeoVectorRows.size(); j++) {
			if (!mdVectorSpatialRepresentation) mdVectorSpatialRepresentation = gmdMetadata.addElement("gmd:spatialRepresentationInfo/gmd:MD_VectorSpatialRepresentation");
			var objGeoVectorRow = objGeoVectorRows.get(j);
			var mdGeometricObjects = mdVectorSpatialRepresentation.addElement("gmd:geometricObjects/gmd:MD_GeometricObjects");
			var geometricObjectTypeCode = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(515, objGeoVectorRow.get("geometric_object_type")); 
			mdGeometricObjects.addElement("gmd:geometricObjectType/gmd:MD_GeometricObjectTypeCode")
				.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#MD_GeometricObjectTypeCode")
				.addAttribute("codeListValue", geometricObjectTypeCode);
			mdGeometricObjects.addElement("gmd:geometricObjectCount/gco:Integer").addText(objGeoVectorRow.get("geometric_object_count"));
		}

		// ---------- <gmd:referenceSystemIdentifier> ----------
		var referenceSystem = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(100, objGeoRow.get("referencesystem_key"));
		if (!hasValue(referenceSystem)) {
			referenceSystem = objGeoRow.get("referencesystem_value");
		}
		if (hasValue(referenceSystem)) {
			var rsIdentifier = gmdMetadata.addElement("gmd:referenceSystemInfo/gmd:MD_ReferenceSystem/gmd:referenceSystemIdentifier/gmd:RS_Identifier");
			rsIdentifier.addElement("gmd:code").addElement("gco:CharacterString").addText(referenceSystem);
			if (referenceSystem.startsWith("EPSG")) {
				rsIdentifier.addElement("gmd:codeSpace/gco:CharacterString").addText("EPSG");
			}
		}
	}
	// ---------- <gmd:identificationInfo> ----------
	var identificationInfo;
	if (objClass.equals("3") || objClass.equals("6")) {
		identificationInfo = gmdMetadata.addElement("gmd:identificationInfo")
			.addElement("srv:SV_ServiceIdentification");
	} else {
		identificationInfo = gmdMetadata.addElement("gmd:identificationInfo")
		.addElement("gmd:MD_DataIdentification");
	}
	identificationInfo.addAttribute("uuid", "ingrid#" + getCitationIdentifier(objRow));
	
	// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation> ----------
	var ciCitation = identificationInfo.addElement("gmd:citation/gmd:CI_Citation");
	// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:title> ----------
	if (hasValue(objRow.get("obj_name"))) {
		ciCitation.addElement("gmd:title/gco:CharacterString").addText(objRow.get("obj_name"));
	}
	// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:alternateTitle> ----------
	if (hasValue(objRow.get("dataset_alternate_name"))) {
		ciCitation.addElement("gmd:alternateTitle/gco:CharacterString").addText(objRow.get("dataset_alternate_name"));
	}
	// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:date/gmd:CI_Date> ----------
	var referenceDateRows = SQL.all("SELECT * FROM t0113_dataset_reference WHERE obj_id=?", [objId]);
	for (j=0; j<referenceDateRows.size(); j++) {
		var referenceDateRow = referenceDateRows.get(j); 
		var ciDate = ciCitation.addElement("gmd:date/gmd:CI_Date");
		var dateValue = TRANSF.getISODateFromIgcDate(referenceDateRow.get("reference_date"));
        if (dateValue.indexOf("T") > -1) {
        	ciDate.addElement("gmd:date/gco:DateTime").addText(dateValue);
        } else {
        	ciDate.addElement("gmd:date/gco:Date").addText(dateValue);
        }
        var dateType = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(502, referenceDateRow.get("type"));
        ciDate.addElement("gmd:dateType/gmd:CI_DateTypeCode")
        	.addAttribute("codeList","http://www.tc211.org/ISO19139/resources/codeList.xml#CI_DateTypeCode")
        	.addAttribute("codeListValue", dateType);
	}

	// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:identifier/gmd:RS_Identifier> ----------
	var rsIdentifier = ciCitation.addElement("gmd:identifier/gmd:RS_Identifier");
	rsIdentifier.addElement("gmd:code/gco:CharacterString").addText(getCitationIdentifier(objRow));
	rsIdentifier.addElement("gmd:codeSpace/gco:CharacterString").addText("ingrid");

	// map literature properties
	if (objClass == "2") {
		var literatureRow = SQL.first("SELECT * from t011_obj_literature WHERE obj_id=?", [objId]);
		if (hasValue(literatureRow)) {
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:editionDate> ----------			
			if (hasValue(literatureRow.get("publish_year"))) {
				ciCitation.addElement("gmd:editionDate/gco:Date").addText(TRANSF.getISODateFromIgcDate(literatureRow.get("publish_year")));
			}
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=originator> ----------
			if (hasValue(literatureRow.get("author"))) {
				var responsiblePartyOriginator = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				responsiblePartyOriginator.addElement("gmd:individualName/gco:CharacterString").addText(literatureRow.get("author"));
				responsiblePartyOriginator.addElement("gmd:role/gmd:CI_RoleCode")
	            	.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
	            	.addAttribute("codeListValue", "originator");
			}
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=resourceProvider> ----------
			if (hasValue(literatureRow.get("loc"))) {
				var responsiblePartyResourceProvider = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				responsiblePartyResourceProvider.addElement("gmd:organisationName/gco:CharacterString").addText("Contact intructions for the location of resource");
				responsiblePartyResourceProvider.addElement("gmd:contactInfo/gmd:CI_Contact/gmd:contactInstructions/gco:CharacterString")
					.addText(literatureRow.get("loc"));
				responsiblePartyResourceProvider.addElement("gmd:role/gmd:CI_RoleCode")
	            	.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
	            	.addAttribute("codeListValue", "resourceProvider");
			}
		    var addressRows = SQL.all("SELECT t02_address.*, t012_obj_adr.type FROM t012_obj_adr, t02_address WHERE t012_obj_adr.adr_uuid=t02_address.adr_uuid AND t02_address.work_state=? AND t012_obj_adr.obj_id=? AND t012_obj_adr.type=? ORDER BY line", ['V', objId, 3360]);
		    for (var i=0; i< addressRows.size(); i++) {
		    	ciCitation.addElement("gmd:citedResponsibleParty").addElement(getCiResponsibleParty(addressRows.get(i), "resourceProvider"));
		    }
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=publisher> ----------
			if (hasValue(literatureRow.get("publish_loc")) || hasValue(literatureRow.get("publisher"))) {
				var responsiblePartyPublisher = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				if (!hasValue(literatureRow.get("publisher"))) {
					responsiblePartyPublisher.addElement("gmd:individualName/gco:CharacterString").addText("Location of the editor");
				} else {
					responsiblePartyPublisher.addElement("gmd:individualName/gco:CharacterString").addText(literatureRow.get("publisher"));
				}
				if (hasValue(literatureRow.get("publish_loc"))) {
					responsiblePartyPublisher.addElement("gmd:contactInfo/gmd:CI_Contact/gmd:address/gmd:CI_Address/gmd:city/gco:CharacterString")
						.addText(literatureRow.get("publish_loc"));
				}
				responsiblePartyPublisher.addElement("gmd:role/gmd:CI_RoleCode")
	            	.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
	            	.addAttribute("codeListValue", "publisher");
			}
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=distribute> ----------
			if (hasValue(literatureRow.get("publishing"))) {
				var responsiblePartyDistributor = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				responsiblePartyDistributor.addElement("gmd:organisationName/gco:CharacterString").addText(literatureRow.get("publishing"));
				responsiblePartyDistributor.addElement("gmd:role/gmd:CI_RoleCode")
		            .addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
		            .addAttribute("codeListValue", "distribute");
			}
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:series> ----------
			var citationSeries;
			if (hasValue(literatureRow.get("publish_in"))) {
				citationSeries = ciCitation.addElement("gmd:series/gmd:CI_Series");
				citationSeries.addElement("gmd:name/gco:CharacterString").addText(literatureRow.get("publish_in"));
			}
			if (hasValue(literatureRow.get("volume"))) {
				if (!citationSeries) citationSeries = ciCitation.addElement("gmd:series/gmd:CI_Series");
				citationSeries.addElement("gmd:issueIdentification/gco:CharacterString").addText(literatureRow.get("volume"));
			}
			if (hasValue(literatureRow.get("sides"))) {
				if (!citationSeries) citationSeries = ciCitation.addElement("gmd:series/gmd:CI_Series");
				citationSeries.addElement("gmd:page/gco:CharacterString").addText(literatureRow.get("sides"));
			}
			if (hasValue(literatureRow.get("doc_info"))) {
				ciCitation.addElement("gmd:otherCitationDetails/gco:CharacterString").addText(literatureRow.get("doc_info"));
			}
			if (hasValue(literatureRow.get("isbn"))) {
				if (!citationSeries) citationSeries = ciCitation.addElement("gmd:series/gmd:CI_Series");
				ciCitation.addElement("gmd:ISBN/gco:CharacterString").addText(literatureRow.get("isbn"));
			}
		}
	} else if (objClass.equals("4")) {
		var projectRow = SQL.first("SELECT * from t011_obj_project WHERE obj_id=?", [objId]);
		if (hasValue(projectRow)) {
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=projectManager> ----------
			if (hasValue(projectRow.get("leader"))) {
				var responsiblePartyOriginator = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				responsiblePartyOriginator.addElement("gmd:individualName/gco:CharacterString").addText(projectRow.get("leader"));
				responsiblePartyOriginator.addElement("gmd:role/gmd:CI_RoleCode")
		            .addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
		            .addAttribute("codeListValue", "projectManager");
			}
		    var addressRows = SQL.all("SELECT t02_address.*, t012_obj_adr.type FROM t012_obj_adr, t02_address WHERE t012_obj_adr.adr_uuid=t02_address.adr_uuid AND t02_address.work_state=? AND t012_obj_adr.obj_id=? AND t012_obj_adr.type=? ORDER BY line", ['V', objId, 3400]);
		    for (var i=0; i< addressRows.size(); i++) {
		    	ciCitation.addElement("gmd:citedResponsibleParty").addElement(getCiResponsibleParty(addressRows.get(i), "projectManager"));
		    }
			// ---------- <gmd:identificationInfo/gmd:citation/gmd:CI_Citation/gmd:citedResponsibleParty/gmd:role/@codeListValue=projectManager> ----------
			if (hasValue(projectRow.get("member"))) {
				var responsiblePartyOriginator = ciCitation.addElement("gmd:citedResponsibleParty/gmd:CI_ResponsibleParty");
				responsiblePartyOriginator.addElement("gmd:individualName/gco:CharacterString").addText(projectRow.get("member"));
				responsiblePartyOriginator.addElement("gmd:role/gmd:CI_RoleCode")
		            .addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
		            .addAttribute("codeListValue", "projectParticipant");
			}
		    var addressRows = SQL.all("SELECT t02_address.*, t012_obj_adr.type FROM t012_obj_adr, t02_address WHERE t012_obj_adr.adr_uuid=t02_address.adr_uuid AND t02_address.work_state=? AND t012_obj_adr.obj_id=? AND t012_obj_adr.type=? ORDER BY line", ['V', objId, 3410]);
		    for (var i=0; i< addressRows.size(); i++) {
		    	ciCitation.addElement("gmd:citedResponsibleParty").addElement(getCiResponsibleParty(addressRows.get(i), "projectParticipant"));
		    }
		}
		
	}
	
	// ---------- <gmd:identificationInfo/gmd:abstract> ----------
	var abstr = objRow.get("obj_descr");
	
	if (objClass.equals("3")) {
		// More data of the service that cannot be mapped within ISO19119, but must be 
		// supplied by INSPIRE. Add mapping in abstract
		var abstractPostfix = "\n\n\nWeitere Daten des Dienstes, die nicht standard-konform (ISO 19119) hinterlegt werden k\u00F6nnen, zum Teil gem\u00E4\u00DF INSPIRE-Direktive aber bereit zu stellen sind*:\n\n\n";
		var objServRow = SQL.first("SELECT * FROM t011_obj_serv WHERE obj_id=?", [objId]);
		if (hasValue(objServRow.get("environment"))) {
			abstractPostfix = abstractPostfix + "Systemumgebung: " + objServRow.get("environment") + "\n";
			abstractPostfix = abstractPostfix + "(environmentDescription/gco:CharacterString= " + objServRow.get("environment") + ")\n\n";
		}
		if (hasValue(objServRow.get("description"))) {
			abstractPostfix = abstractPostfix + "Erl\u00E4uterung zum Fachbezug: " + objServRow.get("description") + "\n";
			abstractPostfix = abstractPostfix + "(supplementalInformation/gco:CharacterString= " + objServRow.get("description") + ")\n\n";
		}
		
		var objServScaleRows = SQL.all("SELECT * FROM t011_obj_serv_scale WHERE obj_serv_id=?", [objServRow.get("id")]);
		for (var j=0; j<objServScaleRows.size(); j++) {
			var objServScaleRow = objServScaleRows.get(j);
			if (hasValue(objServScaleRow.get("scale"))) {
				abstractPostfix = abstractPostfix + "Erstellungsma\u00DFstab: " + objServScaleRow.get("scale") + "\n";
				abstractPostfix = abstractPostfix + "(spatialResolution/MD_Resolution/equivalentScale/MD_RepresentativeFraction/denominator/gco:Integer= " + objServScaleRow.get("scale") + ")\n";
			}
		}
		for (var j=0; j<objServScaleRows.size(); j++) {
			var objServScaleRow = objServScaleRows.get(j);
			if (hasValue(objServScaleRow.get("resolution_ground"))) {
				abstractPostfix = abstractPostfix + "Bodenaufl\u00F6sung (Meter): " + objServScaleRow.get("resolution_ground") + "\n";
				abstractPostfix = abstractPostfix + "(spatialResolution/MD_Resolution/distance/gco:Distance[@uom=\"meter\"]= " + objServScaleRow.get("resolution_ground") + ")\n";
			}
		}
		for (var j=0; j<objServScaleRows.size(); j++) {
			var objServScaleRow = objServScaleRows.get(j);
			if (hasValue(objServScaleRow.get("resolution_scan"))) {
				abstractPostfix = abstractPostfix + "Scanaufl\u00F6sung (DPI): " + objServScaleRow.get("resolution_scan") + "\n";
				abstractPostfix = abstractPostfix + "(spatialResolution/MD_Resolution/distance/gco:Distance[@uom=\"dpi\"]= " + objServScaleRow.get("resolution_scan") + ")\n";
			}
		}
		abstractPostfix = abstractPostfix + "\n\n---\n";
		abstractPostfix = abstractPostfix + "* N\u00E4here Informationen zur INSPIRE-Direktive: http://inspire.jrc.ec.europa.eu/implementingRulesDocs_md.cfm";
		
		abstr = abstr + abstractPostfix;
	}
	identificationInfo.addElement("gmd:abstract/gco:CharacterString").addText(abstr);

    // ---------- <gmd:identificationInfo/gmd:purpose> ----------
    
    value = getPurpose(objRow);
    if (hasValue(value)) {
        identificationInfo.addElement("gmd:purpose/gco:CharacterString").addText(value);
    }

    // ---------- <gmd:identificationInfo/gmd:status> ----------
    value = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(523, objRow.get("time_status"));
    if (hasValue(value)) {
        identificationInfo.addElement("gmd:status/gmd:MD_ProgressCode")
            .addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#MD_ProgressCode")
            .addAttribute("codeListValue", value);
    }

    // ---------- <gmd:identificationInfo/gmd:pointOfContact> ----------
    
    // select only entries from syslist 505 (!= 7) and free entries, all entries of syslist 2010 already mapped above (3360, 3400, 3410) 
    var addressRows = SQL.all("SELECT t02_address.*, t012_obj_adr.type, t012_obj_adr.special_name FROM t012_obj_adr, t02_address WHERE t012_obj_adr.adr_uuid=t02_address.adr_uuid AND t02_address.work_state=? AND t012_obj_adr.obj_id=? AND (t012_obj_adr.type IS NULL OR t012_obj_adr.type!=?) AND (t012_obj_adr.special_ref IS NULL OR t012_obj_adr.special_ref=?) ORDER BY line", ['V', objId, 7, 505]);
    for (var i=0; i< addressRows.size(); i++) {
        var addressRow = addressRows.get(i); 
        var role = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(505, addressRow.get("type"));
        if (!hasValue(role)) {
            role = addressRow.get("special_name");
        }
        if (hasValue(role)) {
            gmdMetadata.addElement("gmd:pointOfContact").addElement(getCiResponsibleParty(addressRow, role));
        }
    }

    // ---------- <gmd:identificationInfo/gmd:resourceMaintenance/gmd:MD_MaintenanceInformation> ----------
    value = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(518, objRow.get("time_period"));
    if (hasValue(value)) {
        var mdMaintenanceInformation = identificationInfo.addElement("gmd:resourceMaintenance/gmd:MD_MaintenanceInformation");
        mdMaintenanceInformation.addElement("gmd:maintenanceAndUpdateFrequency/gmd:MD_MaintenanceFrequencyCode")
            .addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#MD_MaintenanceFrequencyCode")
            .addAttribute("codeListValue", value);
        var timeInterval = objRow.get("time_interval");
        var timeAlle = objRow.get("time_alle");
        if (hasValue(timeInterval) && hasValue(timeAlle)) {
            var period19108 = "P";
            if (timeInterval.equalsIgnoreCase("Tage")) {
                period19108 = period19108.concat(timeAlle).concat("D");
            } else if (timeInterval.equalsIgnoreCase("Jahre")) {
                period19108 = period19108.concat(timeAlle).concat("Y");
            } else if (timeInterval.equalsIgnoreCase("Monate")) {
                period19108 = period19108.concat(timeAlle).concat("M");
            } else if (timeInterval.equalsIgnoreCase("Stunden")) {
                period19108 = period19108.concat("T").concat(timeAlle).concat("H");
            } else if (timeInterval.equalsIgnoreCase("Minuten")) {
                period19108 = period19108.concat("T").concat(timeAlle).concat("M");
            } else if (timeInterval.equalsIgnoreCase("Sekunden")) {
                period19108 = period19108.concat("T").concat(timeAlle).concat("S");
            }
            mdMaintenanceInformation.addElement("gmd:userDefinedMaintenanceFrequency/gts:TM_PeriodDuration")
                .addText(period19108);
        }
        if (hasValue(objRow.get("time_descr"))) {
            mdMaintenanceInformation.addElement("gmd:maintenanceNote/gco:CharacterString").addText(objRow.get("time_descr"));
        }
    }

    // ---------- <gmd:identificationInfo/gmd:resourceFormat> ----------
    if (objClass.equals("2")) {
	    row = SQL.first("SELECT type_key, type_value from t011_obj_literature WHERE obj_id=?", [objId]);
	    if (hasValue(row)) {
            value = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(3385, row.get("type_key"));
	        if (!hasValue(value)) {
	            value = row.get("type_value");
	        }
            if (hasValue(value)) {
                var mdFormat = identificationInfo.addElement("gmd:resourceFormat/gmd:MD_Format");
                mdFormat.addElement("gmd:name/gco:CharacterString").addText(value);
                mdFormat.addElement("gmd:version/gco:CharacterString").addAttribute("gco:nilReason", "inapplicable");
            }
	    }
    }
}



/**
 * Get the fileIdentifier. Try to use DB column "org_obj_id". If not found use column "obj_uuid".
 * 
 * @param objRow DB row representing a t01_object row.
 * @return
 */
function getFileIdentifier(objRow) {
	var fileIdentifier = objRow.get("org_obj_id");
	if (!hasValue(fileIdentifier)) {
		fileIdentifier = objRow.get("obj_uuid");
	}
	return fileIdentifier;
}

/**
 * Create a citation identifier. Try to obtain the identifier from datasource uuid in IGC. 
 * If this fails generate a new UUID based on the fileIdentifier, because the citation Identifier
 * must not be the same as the fileIdentifier. 
 * 
 * @param hit
 * @return
 */
function getCitationIdentifier(objRow) {
	var id;
	var objGeoRow = SQL.first("SELECT * FROM t011_obj_geo WHERE obj_id=?", [objId]);
	if (hasValue(objGeoRow)) {
		id = objGeoRow.get("datasource_uuid");
	}
    if (!hasValue(id)) {
    	id = getFileIdentifier(objRow);
    	id = java.util.UUID.nameUUIDFromBytes(id.getBytes()).toString();
    } else {
    	id = id.replaceAll(":", "#");
    }
    return id;
}

/**
 * Creates an ISO CI_ResponsibleParty element based on a address row and a role. 
 * 
 * @param addressRow
 * @param role
 * @return
 */
function getCiResponsibleParty(addressRow, role) {
	var parentAddressRowPathArray = getAddressRowPathArray(addressRow);
	var ciResponsibleParty = DOM.createElement("gmd:CI_ResponsibleParty");
	var individualName = getIndividualNameFromAddressRow(addressRow);
	if (hasValue(individualName)) {
    	ciResponsibleParty.addElement("gmd:individualName").addElement("gco:CharacterString").addText(individualName);
	}
	var institution = getInstitution(parentAddressRowPathArray);
	if (hasValue(institution)) {
		ciResponsibleParty.addElement("gmd:organisationName").addElement("gco:CharacterString").addText(institution);
	}
	if (hasValue(addressRow.get("job"))) {
		ciResponsibleParty.addElement("gmd:positionName").addElement("gco:CharacterString").addText(addressRow.get("job"));
	}
	var ciContact = ciResponsibleParty.addElement("gmd:contactInfo").addElement("gmd:CI_Contact");
    var communicationsRows = SQL.all("SELECT t021_communication.* FROM t021_communication WHERE t021_communication.adr_id=?", [addressRow.get("id")]);
	var ciTelephone;
	var emailAddresses = new Array();
	var urls = new Array();
    for (var j=0; j< communicationsRows.size(); j++) {
    	if (!ciTelephone) ciTelephone = ciContact.addElement("gmd:phone").addElement("gmd:CI_Telephone");
    	var communicationsRow = communicationsRows.get(j);
    	if (communicationsRow.get("commtype_key") == 1) {
    		// phone
    		ciTelephone.addElement("gmd:voice").addText(communicationsRow.get("comm_value"));
    	} else if (communicationsRow.get("commtype_key") == 2) {
    		// fax
    		ciTelephone.addElement("gmd:facsimile").addText(communicationsRow.get("comm_value"));
    	} else if (communicationsRow.get("commtype_key") == 3) {
    		emailAddresses.push(communicationsRow.get("comm_value"));
    	} else if (communicationsRow.get("commtype_key") == 4) {
    		urls.push(communicationsRow.get("comm_value"));
    	}
    }
    var ciAddress;
    if (hasValue(addressRow.get("postbox")) || hasValue(addressRow.get("postbox_pc")) ||
    		hasValue(addressRow.get("city")) || hasValue(addressRow.get("street"))) {
    	if (!ciAddress) ciAddress = ciContact.addElement("gmd:address").addElement("gmd:CI_Address");
    	if (hasValue(addressRow.get("postbox")) && hasValue(addressRow.get("postbox_pc"))) {
    		ciAddress.addElement("gmd:deliveryPoint").addElement("gco:CharacterString").addText(addressRow.get("postbox"));
    		ciAddress.addElement("gmd:city").addElement("gco:CharacterString").addText(addressRow.get("city"));
    		ciAddress.addElement("gmd:postalCode").addElement("gco:CharacterString").addText(addressRow.get("postbox_pc"));
    	} else {
    		ciAddress.addElement("gmd:deliveryPoint").addElement("gco:CharacterString").addText(addressRow.get("street"));
    		ciAddress.addElement("gmd:city").addElement("gco:CharacterString").addText(addressRow.get("city"));
    		ciAddress.addElement("gmd:postalCode").addElement("gco:CharacterString").addText(addressRow.get("postcode"));
    	}
    }
    if (hasValue(addressRow.get("country_key"))) {
    	if (!ciAddress) ciAddress = ciContact.addElement("gmd:address/gmd:CI_Address");
    	ciAddress.addElement("gmd:country/gco:CharacterString").addText(TRANSF.getISO3166_1_Alpha_3FromNumericLanguageCode(addressRow.get("country_key")));
    }
    for (var j=0; j<emailAddresses.length; j++) {
    	if (!ciAddress) ciAddress = ciContact.addElement("gmd:address/gmd:CI_Address");
    	ciAddress.addElement("gmd:electronicMailAddress/gco:CharacterString").addText(emailAddresses[j]);
    }
    // ISO only supports ONE url per contact
    if (urls.length > 0) {
    	if (!ciAddress) ciAddress = ciContact.addElement("gmd:address/gmd:CI_Address");
    	ciAddress.addElement("gmd:onlineResource/gmd:CI_OnlineResource/gmd:linkage/gmd:URL").addText(urls[0]);
    }
    ciResponsibleParty.addElement("gmd:role").addElement("gmd:CI_RoleCode")
    	.addAttribute("codeList", "http://www.tc211.org/ISO19139/resources/codeList.xml#CI_RoleCode")
    	.addAttribute("codeListValue", role);	
    return ciResponsibleParty;
}

/**
 * Returns the institution based on all parents of an address.
 * 
 * @param parentAdressRowPathArray
 * @return
 */
function getInstitution(parentAdressRowPathArray) {
	var institution = "";
	for(var i=0; i<parentAdressRowPathArray.length; i++) {
		if (hasValue(parentAdressRowPathArray[i].get("institution"))) {
			if (hasValue(institution)) {
				institution = ", " + institution;
			}
			institution = parentAdressRowPathArray[i].get("institution") + institution;
		}
	}
    if (log.isDebugEnabled()) {
    	log.debug("Got institution '" + institution + "' from address path array:" + parentAdressRowPathArray);
    }
    return institution;
}

/**
 * Get the individual name from a address record.
 * 
 * @param addressRow
 * @return The individual name.
 */
function getIndividualNameFromAddressRow(addressRow) {
    var individualName = "";
    var addressing = addressRow.get("address_value");
    var title = addressRow.get("title_value");
    var firstName = addressRow.get("firstname");
    var lastName = addressRow.get("lastname");

    if (hasValue(lastName)) {
    	individualName = lastName;
    }
    
    if (hasValue(firstName)) {
    	individualName = hasValue(individualName) ? individualName += ", " + firstName : firstName;
    }
    
    if (hasValue(title) && !hasValue(addressing)) {
    	individualName = IngridQueryHelper.hasValue(individualName) ? individualName += ", " + title : title;
    } else if (!hasValue(title) && hasValue(addressing)) {
    	individualName = hasValue(individualName) ? individualName += ", " + addressing : addressing;
    } else if (hasValue(title) && hasValue(addressing)) {
    	individualName = hasValue(individualName) ? individualName += ", " + title + " " + addressing : title + " " + addressing;
    }
    
    if (log.isDebugEnabled()) {
    	log.debug("Got individualName '" + individualName + "' from address record:" + addressRow);
    }
    
    return individualName;
	
}

/**
 * Returns an array of address rows representing the complete path from 
 * the given address (first entry in array) to the farthest parent 
 * (last entry in array).
 * 
 * @param addressRow The database address ro to start from.
 * @return The array with all parent address rows.
 */
function getAddressRowPathArray(addressRow) {
	var results = new Array();
    if (log.isDebugEnabled()) {
    	log.debug("Add address with uuid '" + addressRow.get("adr_uuid") + "' to address path:" + parentAdressRow);
    }
    results.push(addressRow);
    var addrId = addressRow.get("id");
    var parentAdressRow = SQL.first("SELECT t02_address.* FROM t02_address, address_node WHERE address_node.addr_id_published=? AND address_node.fk_addr_uuid=t02_address.adr_uuid AND t02_address.work_state=?", [addrId, "V"]);
    while (hasValue(parentAdressRow)) {
        if (log.isDebugEnabled()) {
        	log.debug("Add address with uuid '"+parentAdressRow.get("adr_uuid")+"' to address path:" + parentAdressRow);
        }
    	results.push(parentAdressRow);
    	addrId = parentAdressRow.get("id");
    	parentAdressRow = SQL.first("SELECT t02_address.* FROM t02_address, address_node WHERE address_node.addr_id_published=? AND address_node.fk_addr_uuid=t02_address.adr_uuid AND t02_address.work_state=?", [addrId, "V"]);
    }
    return results;
}

function getHierarchLevel(objClass) {
    var hierarchyLevel = null;
    if (objClass == "0") {
        hierarchyLevel = "nonGeographicDataset";
    } else if (objClass == "1") {
        rows = SQL.all("SELECT hierarchy_level FROM t011_obj_geo WHERE obj_id=?", [objId]);
        // Should be only one row !
        for (j=0; j<rows.size(); j++) {
            hierarchyLevel = TRANSF.getISOCodeListEntryFromIGCSyslistEntry(525, rows.get(j).get("hierarchy_level"));
        }
    } else if (objClass == "2") {
        hierarchyLevel = "nonGeographicDataset";
    } else if (objClass == "3") {
        hierarchyLevel = "service";
    } else if (objClass == "4") {
        hierarchyLevel = "nonGeographicDataset";
    } else if (objClass == "5") {
        hierarchyLevel = "nonGeographicDataset";
    } else if (objClass == "6") {
        hierarchyLevel = "application";
    } else {
        log.error("Unsupported UDK class '" + objClass
	            + "'. Only class 0 to 6 are supported by the CSW interface.");
    }
    
    return hierarchyLevel;
}

function map(needle, haystack) {
    for( var key in haystack ) {
    	if (key == needle) {
    		return haystack[key];
    	}
    }
    log.error("Could not find needle '" + needle + "' in haystack: " + haystack);
    
    return needle; 
}

function getPurpose(objRow) {
    // combine Herstellungszweck and rechtliche Grundlagen
    var purpose = objRow.get("info_note");
    if (!hasValue(purpose)) {
        purpose = "";
    }
    var rows = SQL.all("SELECT legist_value from t015_legist WHERE obj_id=?", [objId]);
    for (var i=0; i<rows.size(); i++) {
        if (hasValue(rows.get(i).get("legist_value"))) {
            if (hasValue(purpose)) {
                purpose = purpose.concat("\n");
            }
            purpose = purpose.concat(rows.get(i).get("legist_value"));
        }
    }
    return purpose;
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
