import * as fs from 'fs';
import * as path from 'path';
import { ExcelParser } from '../src/core/excelParser';
import { SheetData } from '../src/types';

function createFixtures() {
  const fixturesDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // 1. sample_sales.csv
  const csvData = [
    'Order_ID,Customer_Name,Region,Product_Category,Sales,Quantity,Profit,Order_Date',
    'ORD-1001,"Smith, John",North,Technology,1249.99,2,320.50,2024-01-15',
    'ORD-1002,"Johnson, Emma",South,Furniture,650.00,1,85.20,2024-01-16',
    'ORD-1003,"Williams, Michael",East,Office Supplies,45.80,5,12.40,2024-01-18',
    'ORD-1004,"Brown, Sarah",West,Technology,2400.00,3,720.00,2024-01-20',
    'ORD-1005,"Jones, David",North,Furniture,890.50,2,110.00,2024-01-22',
    'ORD-1006,"Garcia, Maria",South,Office Supplies,120.00,10,35.00,2024-01-25',
    'ORD-1007,"Miller, James",East,Technology,1850.00,1,450.00,2024-01-28',
    'ORD-1008,"Davis, Olivia",West,Furniture,320.00,4,45.00,2024-01-30',
    'ORD-1009,"Rodriguez, Daniel",North,Office Supplies,78.90,3,18.50,2024-02-02',
    'ORD-1010,"Martinez, Sophia",South,Technology,3100.00,2,950.00,2024-02-05'
  ].join('\n');

  fs.writeFileSync(path.join(fixturesDir, 'sample_sales.csv'), csvData, 'utf-8');
  console.log('✓ Created sample_sales.csv');

  // 2. sample_products.tsv
  const tsvData = [
    'SKU\tProduct_Name\tCategory\tUnit_Price\tStock_Level\tRating',
    'TECH-01\tUltraBook Pro 15\tLaptops\t1299.99\t45\t4.8',
    'TECH-02\tWireless Noise Cancelling Headphones\tAudio\t199.99\t120\t4.6',
    'TECH-03\tMechanical RGB Keyboard\tPeripherals\t89.50\t210\t4.7',
    'TECH-04\t4K Ultra-Wide Monitor 34"\tMonitors\t549.00\t32\t4.9',
    'TECH-05\tErgonomic Gaming Mouse\tPeripherals\t59.99\t180\t4.5'
  ].join('\n');

  fs.writeFileSync(path.join(fixturesDir, 'sample_products.tsv'), tsvData, 'utf-8');
  console.log('✓ Created sample_products.tsv');

  // 3. sample_financials.xlsx (multi-sheet)
  const excelSheets: { [name: string]: SheetData } = {
    'Quarterly_Revenue': {
      headers: ['Quarter', 'Software', 'Services', 'Hardware', 'Total_Revenue'],
      rows: [
        ['Q1 2024', 250000, 120000, 85000, 455000],
        ['Q2 2024', 280000, 135000, 92000, 507000],
        ['Q3 2024', 310000, 142000, 105000, 557000],
        ['Q4 2024', 390000, 168000, 130000, 688000]
      ]
    },
    'Department_Headcount': {
      headers: ['Department', 'Headcount', 'Avg_Salary_USD', 'Total_Budget'],
      rows: [
        ['Engineering', 45, 120000, 5400000],
        ['Product & Design', 18, 105000, 1890000],
        ['Sales & Marketing', 32, 95000, 3040000],
        ['Operations & HR', 12, 75000, 900000]
      ]
    }
  };

  const excelBuffer = ExcelParser.serialize(excelSheets, 'Quarterly_Revenue');
  fs.writeFileSync(path.join(fixturesDir, 'sample_financials.xlsx'), excelBuffer);
  console.log('✓ Created sample_financials.xlsx');

  // 4. sample_database.db (SQLite with multiple tables)
  const initSqlJs = require('sql.js');
  initSqlJs({
    locateFile: (f: string) => path.resolve(__dirname, '../node_modules/sql.js/dist', f)
  }).then((SQL: any) => {
    const db = new SQL.Database();
    
    // Table: Customers
    db.run(`
      CREATE TABLE Customers (
        CustomerID INTEGER PRIMARY KEY,
        FullName TEXT,
        Email TEXT,
        City TEXT,
        Country TEXT
      );
      INSERT INTO Customers VALUES (1, 'John Doe', 'john@example.com', 'Hanoi', 'Vietnam');
      INSERT INTO Customers VALUES (2, 'Jane Smith', 'jane@example.com', 'Tokyo', 'Japan');
      INSERT INTO Customers VALUES (3, 'Michael Brown', 'michael@example.com', 'London', 'UK');
      INSERT INTO Customers VALUES (4, 'Emma Wilson', 'emma@example.com', 'New York', 'USA');
    `);

    // Table: Orders
    db.run(`
      CREATE TABLE Orders (
        OrderID INTEGER PRIMARY KEY,
        CustomerID INTEGER,
        Product TEXT,
        Amount REAL,
        Status TEXT
      );
      INSERT INTO Orders VALUES (101, 1, 'MacBook Pro 16', 2499.00, 'Completed');
      INSERT INTO Orders VALUES (102, 2, 'Dell XPS 15', 1899.50, 'Completed');
      INSERT INTO Orders VALUES (103, 1, 'Magic Mouse', 99.00, 'Pending');
      INSERT INTO Orders VALUES (104, 3, '4K Monitor', 499.00, 'Shipped');
      INSERT INTO Orders VALUES (105, 4, 'Mechanical Keyboard', 149.00, 'Completed');
    `);

    const data = db.export();
    fs.writeFileSync(path.join(fixturesDir, 'sample_database.db'), Buffer.from(data));
    console.log('✓ Created sample_database.db');
  });
}

createFixtures();
