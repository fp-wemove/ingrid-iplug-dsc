/**
 * 
 */
package de.ingrid.iplug.dsc.index.mapper;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import org.apache.log4j.Logger;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;

import de.ingrid.iplug.dsc.om.DatabaseSourceRecord;
import de.ingrid.iplug.dsc.om.SourceRecord;

/**
 * Maps a {@link DatabaseSourceRecord} to a lucene document. The source database
 * record is retrieved from the database via the connection and the record id
 * specified in the {@link DatabaseSourceRecord}.
 * 
 * A SQL string can be defined to be executed to retrieve the database record.
 * 
 * 
 * @author joachim@wemove.com
 * 
 */
public class SimpleDatabaseRecord2DocumentMapper implements IRecordMapper {

    protected static final Logger log = Logger
            .getLogger(SimpleDatabaseRecord2DocumentMapper.class);

    private String sql;

    @Override
    public void map(SourceRecord record, Document doc) throws Exception {
        if (!(record instanceof DatabaseSourceRecord)) {
            throw new IllegalArgumentException("Record is no DatabaseRecord!");
        }

        String id = (String) record.get(DatabaseSourceRecord.ID);
        Connection connection = (Connection) record
                .get(DatabaseSourceRecord.CONNECTION);
        try {
            PreparedStatement ps = connection.prepareStatement(sql);
            ps.setString(1, id);
            ResultSet rs = ps.executeQuery();
            rs.next();

            for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                String colName = rs.getMetaData().getColumnName(i);
                String colValue = rs.getString(i);
                doc.add(new Field(colName, colValue, Field.Store.YES,
                        Field.Index.ANALYZED));
            }
        } catch (SQLException e) {
            log.error("Error mapping Record.", e);
            throw e;
        }
    }

    public String getSql() {
        return sql;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

}