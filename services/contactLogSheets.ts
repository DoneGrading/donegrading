/**
 * Contact log Google Sheets integration.
 * Creates or appends to a user-chosen spreadsheet.
 */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Extract spreadsheet ID from a Google Sheets URL or raw ID */
export function parseSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{30,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Create a new spreadsheet with Contact Log sheet and header row */
export async function createContactLogSheet(
  accessToken: string,
  title: string = 'DoneGrading Contact Log'
): Promise<string> {
  const res = await fetch(`${SHEETS_BASE}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: 'Contact Log', gridProperties: { frozenRowCount: 1 } },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Timestamp' } },
                    { userEnteredValue: { stringValue: 'Student' } },
                    { userEnteredValue: { stringValue: 'Parent' } },
                    { userEnteredValue: { stringValue: 'Category' } },
                    { userEnteredValue: { stringValue: 'Title' } },
                    { userEnteredValue: { stringValue: 'Note' } },
                    { userEnteredValue: { stringValue: 'Message' } },
                    { userEnteredValue: { stringValue: 'School' } },
                    { userEnteredValue: { stringValue: 'Subject' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create sheet: ${res.status}`);
  }

  const data = await res.json();
  return data.spreadsheetId;
}

/** Get the first sheet's name (for append range) */
export async function getSheetInfo(
  accessToken: string,
  spreadsheetId: string
): Promise<{ firstSheetName: string }> {
  const res = await fetch(`${SHEETS_BASE}/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Invalid or inaccessible spreadsheet.');
  const data = await res.json();
  const firstSheetName = data.sheets?.[0]?.properties?.title || 'Sheet1';
  return { firstSheetName };
}

/** Append a contact log row to an existing spreadsheet */
export async function appendContactLog(
  accessToken: string,
  spreadsheetId: string,
  row: {
    student: string;
    parent: string;
    category: string;
    title: string;
    note: string;
    fullMessage: string;
    school: string;
    subject: string;
  }
): Promise<void> {
  const { firstSheetName } = await getSheetInfo(accessToken, spreadsheetId);
  const timestamp = new Date().toISOString();
  const values = [
    [
      timestamp,
      row.student,
      row.parent,
      row.category,
      row.title,
      row.note,
      row.fullMessage,
      row.school,
      row.subject,
    ],
  ];

  // Quote sheet name for A1 notation (required when name has spaces/special chars)
  const rangeA1 = `'${firstSheetName.replace(/'/g, "''")}'!A:I`;
  const range = encodeURIComponent(rangeA1);
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to append: ${res.status}`);
  }
}
