/**
 * 
 */
package de.ingrid.iplug.dsc.record;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;

import de.ingrid.iplug.dsc.om.DatabaseConnection;
import de.ingrid.iplug.dsc.om.DatabaseSourceRecord;
import de.ingrid.iplug.dsc.om.SourceRecord;
import de.ingrid.utils.IConfigurable;
import de.ingrid.utils.PlugDescription;

/**
 * @author joachim@wemove.com
 *
 */
public class PlugDescriptionConfiguredDatabaseRecordProducer implements
        IRecordProducer, IConfigurable {

    
    DatabaseConnection internalDatabaseConnection = null;
    Connection connection = null;
    
    final private static Log log = LogFactory
    .getLog(PlugDescriptionConfiguredDatabaseRecordProducer.class);
    
    /* (non-Javadoc)
     * @see de.ingrid.iplug.dsc.record.IRecordProducer#getRecord(org.apache.lucene.document.Document)
     */
    @Override
    public SourceRecord getRecord(Document doc) {
        openConnection();
        // TODO make the field configurable
        Field field = doc.getField("ID");
        return new DatabaseSourceRecord(field.stringValue(), connection);
    }

    /* (non-Javadoc)
     * @see de.ingrid.iplug.dsc.record.IRecordProducer#getRecord(org.apache.lucene.document.Document)
     */
    @Override
    public void configure(PlugDescription plugDescription) {
        this.internalDatabaseConnection = (DatabaseConnection) plugDescription
                .getConnection();
    }

    @Override
    public void closeDatasource() {
        closeConnection();
        
    }

    @Override
    public void openDatasource() {
        openConnection();
        
    }        
    
    private void openConnection() {
        try {
            if (connection == null || connection.isClosed()) {
                Class.forName(internalDatabaseConnection.getDataBaseDriver());
                String url = internalDatabaseConnection.getConnectionURL();
                String user = internalDatabaseConnection.getUser();
                String password = internalDatabaseConnection.getPassword();
                log.info("Opening database connection.");
                connection = DriverManager.getConnection(url, user, password);
            }
        } catch (Exception e) {
            log.error("Error opening connection!", e);
        }
    }

    private void closeConnection() {
        if (connection != null) {
            try {
                log.info("Closing database connection.");
                connection.close();
            } catch (SQLException e) {
                log.error("Error closing connection.", e);
            }
        }
    }



}
