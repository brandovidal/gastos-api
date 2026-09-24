// Downloads of kogane-api (D39): Excel and PDF, for the web and for the bot
export enum ReportFormat {
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export const REPORT_MIME_TYPES: Record<ReportFormat, string> = {
  [ReportFormat.XLSX]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ReportFormat.PDF]: 'application/pdf',
}
