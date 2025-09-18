using {upload.db as my  } from '../db/schema'; 


service CMOService  {
 
    action convertExcelToCsv(file: LargeString)          returns {
        csvText : LargeString;
        message : String;
    };
 
}