/*
 * **************************************************-
 * InGrid-iPlug DSC
 * ==================================================
 * Copyright (C) 2014 - 2020 wemove digital solutions GmbH
 * ==================================================
 * Licensed under the EUPL, Version 1.1 or – as soon they will be
 * approved by the European Commission - subsequent versions of the
 * EUPL (the "Licence");
 * 
 * You may not use this work except in compliance with the Licence.
 * You may obtain a copy of the Licence at:
 * 
 * http://ec.europa.eu/idabc/eupl5
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the Licence is distributed on an "AS IS" basis,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the Licence for the specific language governing permissions and
 * limitations under the Licence.
 * **************************************************#
 */
/**
 * 
 */
package de.ingrid.iplug.dsc.index.producer;

import de.ingrid.iplug.dsc.index.DatabaseConnection;
import de.ingrid.iplug.dsc.om.DatabaseSourceRecord;
import de.ingrid.iplug.dsc.om.SourceRecord;
import de.ingrid.iplug.dsc.utils.DatabaseConnectionUtils;
import de.ingrid.utils.IConfigurable;
import de.ingrid.utils.PlugDescription;
import de.ingrid.utils.statusprovider.StatusProvider;
import de.ingrid.utils.statusprovider.StatusProviderService;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Takes care of selecting all source record Ids from a database. The SQL 
 * statement is configurable via Spring.
 * 
 * The database connection is configured via the PlugDescription.
 * 
 * 
 * @author joachim@wemove.com
 * 
 */
// Bean created depending on SpringConfiguration
//@Service
public class PlugDescriptionConfiguredDatabaseRecordSetProducer implements
        IRecordSetProducer, IConfigurable {

    @Autowired
    private StatusProviderService statusProviderService;

    DatabaseConnection internalDatabaseConnection = null;

    String recordSql = "";

    String recordByIdSql = "";

    Iterator<String> recordIdIterator = null;

    private int numRecords;

    final private static Log log = LogFactory
            .getLog(PlugDescriptionConfiguredDatabaseRecordSetProducer.class);

    public PlugDescriptionConfiguredDatabaseRecordSetProducer() {
        log.info("PlugDescriptionConfiguredDatabaseRecordProducer started.");
    }

    /*
     * (non-Javadoc)
     * 
     * @see de.ingrid.iplug.dsc.index.IRecordProducer#hasNext()
     */
    @Override
    public boolean hasNext() {
        if (recordIdIterator == null) {
            createRecordIdsFromDatabase();
        }
        if (recordIdIterator.hasNext()) {
            return true;
        } else {
            reset();
            return false;
        }
    }
    
    /**
     * Closes the connection to the database and resets the iterator for the records. 
     * After a reset, the hasNext() function will start from the beginning again.
     */
    @Override
    public void reset() {
        recordIdIterator =  null;
        closeDatasource();
    }

    /*
     * (non-Javadoc)
     * 
     * @see de.ingrid.iplug.dsc.index.IRecordProducer#next()
     */
    @Override
    public SourceRecord next() {
        Connection connection = null;
        try {
            // connection will be closed in autoclosable DatabaseSourceRecord
            connection = DatabaseConnectionUtils.getInstance().openConnection(internalDatabaseConnection);
            return new DatabaseSourceRecord(recordIdIterator.next(), connection);
        } catch (SQLException e) {
            log.error("Error getting connection from datasource.", e);
        }
        // make sure connnection is closed after failure
        if (connection != null) {
            try {
                connection.close();
            } catch (SQLException e) {
                log.error("Error closing connection after failure.", e);
            }
        }
        return null;
    }

    @Override
    public void configure(PlugDescription plugDescription) {
        this.internalDatabaseConnection = (DatabaseConnection) plugDescription
                .getConnection();
    }

    public String getRecordSql() {
        return recordSql;
    }

    public void setRecordSql(String recordSql) {
        this.recordSql = recordSql;
    }

    public String getRecordByIdSql() {
        return recordByIdSql;
    }

    public void setRecordByIdSql(String recordByIdSql) {
        this.recordByIdSql = recordByIdSql;
    }

    private void closeDatasource() {
        try {
            DatabaseConnectionUtils.getInstance().closeDataSource();
        } catch (SQLException e) {
            log.error("Error closing datasource.", e);
        }
    }

    private void createRecordIdsFromDatabase() {
        try {
            List<String> recordIds = new ArrayList<String>();
            if (log.isDebugEnabled()) {
                log.debug("SQL: " + recordSql);
            }
            try (Connection conn = DatabaseConnectionUtils.getInstance().openConnection(internalDatabaseConnection)) {
                try (PreparedStatement ps = conn.prepareStatement(recordSql)) {
                    try (ResultSet rs = ps.executeQuery()) {
                        while (rs.next()) {
                            recordIds.add(rs.getString(1));
                        }
                        recordIdIterator = recordIds.listIterator();
                        numRecords = recordIds.size();
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error creating record ids.", e);
        }
    }

    @Override
    public int getDocCount() {
        return numRecords;
    }

    /**
     * Returns a DatabaseSourceRecord based on the database ID of the record.
     * Note that the result can be null if the publication conditions are not
     * met based on the SQL provided in property recordByIdSql, even if the
     * database ID exists.
     *
     * @param id The id of the record.
     * @return
     * @throws Exception
     */
    @Override
    public SourceRecord getRecordById(String id) throws Exception {
        if (recordByIdSql == null || recordByIdSql.length() == 0) {
            throw new RuntimeException("Property recordByIdSql not set.");
        }

        Connection conn = null;
        try {
            // connection will be closed in autoclosable DatabaseSourceRecord
            conn = DatabaseConnectionUtils.getInstance().openConnection(internalDatabaseConnection);
            try (PreparedStatement ps = conn.prepareStatement(recordByIdSql)) {
                ps.setString(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    String recordId = null;
                    if (rs.next()) {
                        if (log.isDebugEnabled()) {
                            log.debug("Record with ID '" + id + "' found by SQL: '" + recordByIdSql + "'");
                        }
                        return new DatabaseSourceRecord(rs.getString(1), conn);
                    } else {
                        // no record found
                        // this can happen if the publication conditions based on
                        // SQL in recordByIdSql are not met
                        if (log.isDebugEnabled()) {
                            log.debug("Record with ID '" + id + "' could be found by SQL: '" + recordByIdSql + "'");
                        }
                        // close connection explicit if no record could be obtained.
                        if (conn != null) {
                            conn.close();
                        }
                        return null;
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error obtaining record with ID '" + id + "' by SQL: '" + recordByIdSql + "'", e);
            if (conn != null) {
                conn.close();
            }
        }
        return null;
    }

    public void setStatusProviderService(StatusProviderService statusProviderService) {
        this.statusProviderService = statusProviderService;
    }

}
