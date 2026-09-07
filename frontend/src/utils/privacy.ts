/**
 * DPDP Act (Digital Personal Data Protection Act) compliant PII masking utilities.
 */

export type PIIType = 'account' | 'phone' | 'upi' | 'email' | 'aadhaar' | 'name' | string;

export function maskPII(type: PIIType, value: string): string {
  if (!value) return '';

  const str = String(value).trim();
  const lowerType = (type || '').toLowerCase();

  switch (lowerType) {
    case 'account':
    case 'bank_account':
    case 'account_number': {
      if (str.length <= 4) return '****';
      const visibleStart = str.length > 8 ? 4 : 2;
      const visibleEnd = 4;
      const start = str.slice(0, visibleStart);
      const end = str.slice(-visibleEnd);
      const maskedLength = Math.max(str.length - visibleStart - visibleEnd, 4);
      return `${start}${'*'.repeat(maskedLength)}${end}`;
    }

    case 'phone':
    case 'mobile':
    case 'phone_number': {
      const clean = str.replace(/[^0-9+]/g, '');
      if (clean.length <= 4) return '******';
      const end = clean.slice(-4);
      return `******${end}`;
    }

    case 'upi':
    case 'upi_id':
    case 'vpa': {
      const parts = str.split('@');
      if (parts.length === 2) {
        const username = parts[0];
        const handle = parts[1];
        if (username.length <= 2) {
          return `**@${handle}`;
        }
        const first = username[0];
        const last = username[username.length - 1];
        return `${first}${'*'.repeat(Math.max(username.length - 2, 3))}${last}@${handle}`;
      }
      return `${str.slice(0, 2)}****${str.slice(-2)}`;
    }

    case 'email': {
      const parts = str.split('@');
      if (parts.length === 2) {
        const name = parts[0];
        const domain = parts[1];
        const visible = name.slice(0, 2);
        return `${visible}****@${domain}`;
      }
      return `${str.slice(0, 2)}****`;
    }

    case 'aadhaar': {
      const clean = str.replace(/[^0-9]/g, '');
      if (clean.length === 12) {
        return `XXXX-XXXX-${clean.slice(-4)}`;
      }
      return `XXXX-XXXX-${str.slice(-4)}`;
    }

    case 'name': {
      const words = str.split(' ');
      return words.map(w => (w.length > 1 ? `${w[0]}${'*'.repeat(w.length - 1)}` : w)).join(' ');
    }

    default: {
      if (str.length <= 4) return '****';
      const start = str.slice(0, 2);
      const end = str.slice(-2);
      return `${start}${'*'.repeat(Math.max(str.length - 4, 4))}${end}`;
    }
  }
}
