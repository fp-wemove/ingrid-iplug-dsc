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

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import de.ingrid.utils.statusprovider.StatusProvider;
import de.ingrid.utils.statusprovider.StatusProviderService;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.beans.factory.annotation.Autowired;

import de.ingrid.iplug.dsc.index.DatabaseConnection;
import de.ingrid.iplug.dsc.om.DatabaseSourceRecord;
import de.ingrid.iplug.dsc.om.SourceRecord;
import de.ingrid.iplug.dsc.utils.DatabaseConnectionUtils;
import de.ingrid.utils.IConfigurable;
import de.ingrid.utils.PlugDescription;

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
    Connection connection = null;
    String recordSql = "";
    Iterator<String> recordIdIterator = null;
    private int numRecords;

    private boolean databaseConnectionSupportsIsValid = false;

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
            openConnection();
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
        closeConnection();
    }

    /*
     * (non-Javadoc)
     * 
     * @see de.ingrid.iplug.dsc.index.IRecordProducer#next()
     */
    @Override
    public SourceRecord next() {
        try {
            // try to refresh the database connection if invalid of
            // see https://redmine.informationgrid.eu/issues/1547
            if (connection == null || connection.isClosed()) {
                log.info("Database connection closed or invalid. Try to reconnect.");
                openConnection();
            }
            if (databaseConnectionSupportsIsValid && !connection.isValid(1000)) {
                log.info("Database connection invalid. Try to reconnect.");
                openConnection();
            }
        } catch (SQLException e) {
            log.error("Error Refreshing the database connection.", e);
        }
        return new DatabaseSourceRecord(recordIdIterator.next(), connection);
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

    private void openConnection() {
        try {
           	connection = DatabaseConnectionUtils.getInstance().openConnection(internalDatabaseConnection);
        } catch (Exception e) {
            log.error("Error opening connection!", e);
            statusProviderService.getDefaultStatusProvider().addState("error", "Error opening connection: " + e.getMessage(), StatusProvider.Classification.ERROR);
        }
        try {
            if (!Modifier.isAbstract(connection.getClass().getMethod("isValid").getModifiers())) {
                databaseConnectionSupportsIsValid = true;
            }
        } catch (NoSuchMethodException e) {
            log.info("Database jdbc driver does not support isValid method.");
            databaseConnectionSupportsIsValid = false;
        }
    }

    private void closeConnection() {
        if (connection != null) {
            try {
            	DatabaseConnectionUtils.getInstance().closeConnection(connection);
            } catch (SQLException e) {
                log.error("Error closing connection.", e);
            }
        }
    }

    private void createRecordIdsFromDatabase() {
        try {
            List<String> recordIds = new ArrayList<String>();
            if (log.isDebugEnabled()) {
                log.debug("SQL: " + recordSql);
            }
            PreparedStatement ps = connection.prepareStatement(recordSql);
            try {
                ResultSet rs = ps.executeQuery();
                try {
                    while (rs.next()) {
                        recordIds.add(rs.getString(1));
                    }
                    recordIdIterator = recordIds.listIterator();
                    numRecords = recordIds.size();
                } catch (Exception e) {
                    throw e;
                } finally {
                    rs.close();
                }
            } catch (Exception e) {
                throw e;
            } finally {
                ps.close();
            }
        } catch (Exception e) {
            log.error("Error creating record ids.", e);
        }
    }

    @Override
    public int getDocCount() {
        return numRecords;
    }

    public void setStatusProviderService(StatusProviderService statusProviderService) {
        this.statusProviderService = statusProviderService;
    }

}
