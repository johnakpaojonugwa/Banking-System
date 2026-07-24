import PDFDocument from 'pdfkit';

/**
 * Generates an official Bank Statement PDF buffer.
 */
export function generateStatementPDF(account, transactions, user, startDate, endDate) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Header
      doc
        .fontSize(20)
        .text('APEX GLOBAL BANKING', { align: 'center', underline: true })
        .fontSize(12)
        .text('Official Account Statement', { align: 'center' })
        .moveDown(1.5);

      // Account & Customer Metadata
      doc.fontSize(10);
      doc.text(`Account Holder: ${user.full_name || 'N/A'}`);
      doc.text(`Email: ${user.email}`);
      doc.text(`Account Number: ${account.account_number}`);
      doc.text(`Account Type: ${account.type} (${account.currency || 'USD'})`);
      doc.text(`Current Balance: $${(Number(account.balance) / 100).toFixed(2)}`);
      doc.text(`Overdraft Limit: $${(Number(account.overdraft_limit) / 100).toFixed(2)}`);
      doc.text(`Statement Period: ${startDate || 'Beginning'} to ${endDate || 'Present'}`);
      doc.moveDown(1.5);

      // Transactions Table Header
      doc.fontSize(10).text('Date | Type | Reference | Amount | Balance After', { underline: true });
      doc.moveDown(0.5);

      // Transactions List
      if (transactions.length === 0) {
        doc.text('No transactions recorded during this period.');
      } else {
        transactions.forEach((tx) => {
          const dateStr = new Date(tx.created_at).toISOString().split('T')[0];
          const amtStr = `$${(Number(tx.amount) / 100).toFixed(2)}`;
          const balStr = `$${(Number(tx.balance_after) / 100).toFixed(2)}`;
          doc.text(`${dateStr} | ${tx.type} | ${tx.reference || 'N/A'} | ${amtStr} | ${balStr}`);
        });
      }

      // Footer
      doc
        .moveDown(2)
        .fontSize(8)
        .text('This is a system-generated document. Apex Global Banking Inc.', { align: 'center', italic: true });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export default { generateStatementPDF };
