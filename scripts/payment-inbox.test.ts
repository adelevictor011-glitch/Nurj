import { describe, expect, it } from 'vitest';
import { findAmounts, findTokens, isCreditAlert, parseEmail, senderAllowed, senderAuthenticated } from '../api/cron/payment-inbox';

const alert = [
  'Authentication-Results: mx.titan.email; spf=pass smtp.mailfrom=gtbank.com; dkim=pass header.d=gtbank.com; dmarc=pass header.from=gtbank.com',
  'Authentication-Results: forged.example; dkim=pass header.d=gtbank.com',
  'From: "GTBank Alerts" <alerts@gtbank.com>',
  'Subject: =?UTF-8?B?R1RCYW5rIENyZWRpdCBBbGVydA==?=',
  'Message-ID: <abc123@gtbank.com>',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<table><tr><td>Amount</td><td>NGN 10,000.00</td></tr><tr><td>Narration</td><td>TRF FROM ADA/NURJ K7Q4MX/NIP</td></tr>',
  '<tr><td>Balance</td><td>&#8358;1,234,567.89</td></tr></table>',
  '--b1--',
  '',
].join('\r\n');

describe('payment inbox parsing', () => {
  const email = parseEmail(alert);

  it('reads sender, subject and text from a MIME alert', () => {
    expect(email.from).toBe('alerts@gtbank.com');
    expect(email.subject).toBe('GTBank Credit Alert');
    expect(email.messageId).toBe('abc123@gtbank.com');
    expect(email.text).toContain('NURJ K7Q4MX');
  });

  it('finds the token and the naira amounts', () => {
    expect(findTokens(email.text)).toEqual(['K7Q4MX']);
    expect(findAmounts(email.text)).toContain(1_000_000);
    expect(findTokens('nurj-k7q4mx, NURJK7Q4MX')).toEqual(['K7Q4MX']);
    expect(findTokens('NURJ-K7Q4MXX NURJ-I0O1AB')).toEqual([]);
    expect(findAmounts('You have received N5,000 from X. Amount: 25000.50')).toEqual([500_000, 2_500_050]);
  });

  it('tells credits from debits', () => {
    expect(isCreditAlert(email.subject, email.text)).toBe(true);
    expect(isCreditAlert('Debit Alert', 'You were debited NGN 5,000')).toBe(false);
  });

  it('only trusts allow-listed senders verified by our own mail server', () => {
    expect(senderAllowed('alerts@gtbank.com', ['gtbank.com'])).toBe(true);
    expect(senderAllowed('alerts@notgtbank.com', ['gtbank.com'])).toBe(false);
    expect(senderAllowed('alerts@gtbank.com', ['other@gtbank.com'])).toBe(false);
    expect(senderAuthenticated(email.headers, email.from, 'mx.titan.email')).toBe(true);
    expect(senderAuthenticated(email.headers, email.from, undefined)).toBe(false);
    expect(senderAuthenticated(email.headers, email.from, 'forged.example')).toBe(false);
    const failed = parseEmail(alert.replace('dkim=pass header.d=gtbank.com; dmarc=pass', 'dkim=fail header.d=gtbank.com; dmarc=fail'));
    expect(senderAuthenticated(failed.headers, failed.from, 'mx.titan.email')).toBe(false);
  });

  it('notices a receipt attachment on a proof email', () => {
    const proof = parseEmail([
      'From: Ada <ada@gmail.com>', 'Subject: Payment NURJ-K7Q4MX', 'Content-Type: multipart/mixed; boundary=x', '',
      '--x', 'Content-Type: text/plain', 'Content-Transfer-Encoding: base64', '', Buffer.from('I paid ₦10,000').toString('base64'),
      '--x', 'Content-Type: image/png', 'Content-Disposition: attachment', '', 'AAAA', '--x--', '',
    ].join('\r\n'));
    expect(proof.hasAttachment).toBe(true);
    expect(findTokens(`${proof.subject}\n${proof.text}`)).toEqual(['K7Q4MX']);
    expect(findAmounts(proof.text)).toEqual([1_000_000]);
  });
});
