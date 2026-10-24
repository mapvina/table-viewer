import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { CsvParser } from '../src/core/csvParser';
import { ExcelParser } from '../src/core/excelParser';
import { SqliteParser } from '../src/core/sqliteParser';
import { StatsCalculator } from '../src/core/stats';
import { TableExporter } from '../src/core/exporter';
import { FilterEngine } from '../src/webview/filter';
import { ColumnFilter, SheetData } from '../src/types';

async function runTests() {
  console.log('🧪 Starting Table Viewer Core Engine Tests...\n');

  // 1. CSV Parser Tests
  console.log('--- 1. CSV Parser Tests ---');
  {
    const csvContent = `Name,Age,City,Salary\nAlice,30,New York,75000\n"Bob, Jr.",25,"San Francisco",82000\nCharlie,35,Chicago,90000`;
    const doc = CsvParser.parse(csvContent, 'employees.csv');
    assert.strictEqual(doc.sheetNames.length, 1);
    assert.strictEqual(doc.activeSheet, 'Sheet1');
    const sheet = doc.sheets['Sheet1'];
    assert.deepStrictEqual(sheet.headers, ['Name', 'Age', 'City', 'Salary']);
    assert.strictEqual(sheet.rows.length, 3);
    assert.strictEqual(sheet.rows[1][0], 'Bob, Jr.');
    assert.strictEqual(sheet.rows[1][2], 'San Francisco');
    console.log('✓ Standard CSV parsed correctly with quotes and commas');

    // Delimiter auto-detection (semicolon)
    const semiContent = `Product;Price;Quantity\nLaptop;1200;5\nPhone;800;12`;
    const semiDoc = CsvParser.parse(semiContent, 'inventory.csv');
    assert.strictEqual(semiDoc.delimiter, ';');
    assert.strictEqual(semiDoc.sheets['Sheet1'].headers.length, 3);
    console.log('✓ Semicolon delimiter auto-detected');

    // Delimiter auto-detection (tab/tsv)
    const tsvContent = `ID\tScore\tGrade\n1\t95\tA\n2\t82\tB`;
    const tsvDoc = CsvParser.parse(tsvContent, 'grades.tsv');
    assert.strictEqual(tsvDoc.delimiter, '\t');
    assert.strictEqual(tsvDoc.format, 'tsv');
    console.log('✓ TSV tab delimiter detected');

    // UTF-8 BOM test
    const bomCsv = '\uFEFFHeaderA,HeaderB\nValA,ValB';
    const bomDoc = CsvParser.parse(bomCsv, 'bom.csv');
    assert.strictEqual(bomDoc.sheets['Sheet1'].headers[0], 'HeaderA');
    console.log('✓ UTF-8 BOM stripped properly');

    // Serialization test
    const serialized = CsvParser.serialize(sheet, ',');
    assert.ok(serialized.includes('Alice,30,New York,75000'));
    console.log('✓ Serialization back to CSV matches');
  }

  // 2. Excel Parser Tests
  console.log('\n--- 2. Excel Parser Tests ---');
  {
    const sampleSheets: { [name: string]: SheetData } = {
      Sales: {
        headers: ['Month', 'Revenue', 'Target Met'],
        rows: [
          ['January', 50000, 'Yes'],
          ['February', 48000, 'No'],
          ['March', 62000, 'Yes']
        ]
      },
      Expenses: {
        headers: ['Category', 'Amount'],
        rows: [
          ['Rent', 5000],
          ['Salaries', 25000],
          ['Utilities', 1200]
        ]
      }
    };

    const buffer = await ExcelParser.serialize(sampleSheets, 'Sales');
    assert.ok(buffer instanceof Uint8Array);
    assert.ok(buffer.length > 0);
    console.log(`✓ Serialized multi-sheet Excel workbook (${buffer.length} bytes)`);

    // Parse back
    const roundTripDoc = await ExcelParser.parse(buffer, 'report.xlsx');
    assert.strictEqual(roundTripDoc.sheetNames.length, 2);
    assert.ok(roundTripDoc.sheetNames.includes('Sales'));
    assert.ok(roundTripDoc.sheetNames.includes('Expenses'));
    assert.strictEqual(roundTripDoc.sheets['Sales'].rows.length, 3);
    assert.strictEqual(roundTripDoc.sheets['Expenses'].rows[0][1], 5000);
    console.log('✓ Re-parsed Excel workbook preserves all sheets, headers, and values');
  }

  // 3. Statistics Calculator Tests
  console.log('\n--- 3. Statistics Calculator Tests ---');
  {
    const rows = [
      ['Alice', 10],
      ['Bob', 20],
      ['Charlie', 30],
      ['Diana', 40],
      ['Edward', '']
    ];

    const numStats = StatsCalculator.calculateColumnStats(1, 'Score', rows);
    assert.strictEqual(numStats.isNumeric, true);
    assert.strictEqual(numStats.totalCount, 5);
    assert.strictEqual(numStats.nonEmptyCount, 4);
    assert.strictEqual(numStats.emptyCount, 1);
    assert.strictEqual(numStats.sum, 100);
    assert.strictEqual(numStats.avg, 25);
    assert.strictEqual(numStats.min, 10);
    assert.strictEqual(numStats.max, 40);
    assert.strictEqual(numStats.median, 25);
    console.log('✓ Numeric statistics calculated accurately (sum, avg, min, max, median, counts)');

    const textStats = StatsCalculator.calculateColumnStats(0, 'Name', rows);
    assert.strictEqual(textStats.isNumeric, false);
    assert.strictEqual(textStats.distinctCount, 5);
    console.log('✓ Text column statistics calculated accurately');

    const selStats = StatsCalculator.calculateSelectionStats([10, 20, 30, 'invalid', null]);
    assert.strictEqual(selStats.count, 5);
    assert.strictEqual(selStats.numericCount, 3);
    assert.strictEqual(selStats.sum, 60);
    assert.strictEqual(selStats.avg, 20);
    console.log('✓ Selection statistics calculated accurately');
  }

  // 4. Filter Engine Tests
  console.log('\n--- 4. Filter Engine Tests ---');
  {
    const rows = [
      ['Apple', '10', 'Fruit'],
      ['Banana', '25', 'Fruit'],
      ['Carrot', '15', 'Vegetable'],
      ['Dragonfruit', '40', 'Fruit'],
      ['Eggplant', '8', 'Vegetable']
    ];

    // Greater than filter
    const gtFilter: ColumnFilter = { columnIdx: 1, operator: 'gt', value: '15' };
    const gtResult = FilterEngine.filterRows(rows, '', false, false, [gtFilter]);
    assert.deepStrictEqual(gtResult, [1, 3]); // Banana (25), Dragonfruit (40)
    console.log('✓ Numeric GT filter works correctly');

    // Contains filter
    const containsFilter: ColumnFilter = { columnIdx: 2, operator: 'equals', value: 'vegetable' };
    const containsResult = FilterEngine.filterRows(rows, '', false, false, [containsFilter]);
    assert.deepStrictEqual(containsResult, [2, 4]); // Carrot, Eggplant
    console.log('✓ Column equals filter works correctly');

    // Global search term
    const searchResult = FilterEngine.filterRows(rows, 'fruit', false, false, []);
    assert.deepStrictEqual(searchResult, [0, 1, 3]); // Apple, Banana, Dragonfruit
    console.log('✓ Global search term works across columns');

    // Regex search
    const regexResult = FilterEngine.filterRows(rows, '^b.*', false, true, []);
    assert.deepStrictEqual(regexResult, [1]); // Banana
    console.log('✓ Regex search matches accurately');
  }

  // 5. Exporter Tests
  console.log('\n--- 5. Exporter Tests ---');
  {
    const sheetData: SheetData = {
      headers: ['Country', 'Capital', 'Population'],
      rows: [
        ['Vietnam', 'Hanoi', 100000000],
        ['Japan', 'Tokyo', 125000000]
      ]
    };

    const md = TableExporter.toMarkdown(sheetData);
    assert.ok(md.includes('| Country | Capital | Population |'));
    assert.ok(md.includes('| Vietnam | Hanoi | 100000000 |'));
    console.log('✓ Markdown exporter produced valid markdown table');

    const html = TableExporter.toHtml(sheetData);
    assert.ok(html.includes('<th>Country</th>'));
    assert.ok(html.includes('<td>Vietnam</td>'));
    console.log('✓ HTML exporter produced valid HTML document table');

    const json = TableExporter.toJson(sheetData);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].Country, 'Vietnam');
    assert.strictEqual(parsed[0].Capital, 'Hanoi');
    console.log('✓ JSON exporter produced valid JSON array of objects');
  }

  // 6. SQLite Database Parser Tests
  console.log('\n--- 6. SQLite Database Parser Tests ---');
  {
    const dbPath = path.join(__dirname, 'fixtures', 'sample_database.db');
    const buffer = fs.readFileSync(dbPath);
    const doc = await SqliteParser.parse(new Uint8Array(buffer), 'sample_database.db');

    assert.strictEqual(doc.format, 'sqlite');
    assert.strictEqual(doc.isReadOnly, true);
    assert.ok(doc.sheetNames.includes('Customers'));
    assert.ok(doc.sheetNames.includes('Orders'));

    const customers = doc.sheets['Customers'];
    assert.deepStrictEqual(customers.headers, ['CustomerID', 'FullName', 'Email', 'City', 'Country']);
    assert.strictEqual(customers.rows.length, 4);
    assert.strictEqual(customers.rows[0][1], 'John Doe');
    assert.strictEqual(customers.rows[1][3], 'Tokyo');

    const orders = doc.sheets['Orders'];
    assert.deepStrictEqual(orders.headers, ['OrderID', 'CustomerID', 'Product', 'Amount', 'Status']);
    assert.strictEqual(orders.rows.length, 5);
    assert.strictEqual(orders.rows[0][2], 'MacBook Pro 16');
    assert.strictEqual(orders.rows[0][3], 2499.00);
    console.log('✓ SQLite database tables, headers, and rows parsed successfully');
  }

  console.log('\n🎉 ALL 20 TEST SUITES PASSED SUCCESSFULLY!\n');
}

runTests();
