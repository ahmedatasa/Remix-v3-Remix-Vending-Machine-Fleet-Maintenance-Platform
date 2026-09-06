import {
  IWhatsAppProvider,
  WhatsAppProviderResult,
  WhatsAppWebhookEvent,
  TicketCommunication,
  FaultCategory,
  TicketPriority
} from '../types';

export class MockWhatsAppProvider implements IWhatsAppProvider {
  name = 'MockWhatsAppProvider';
  private sentMessages: Array<{ to: string; message: string; timestamp: string; messageId: string }> = [];

  async sendMessage(to: string, message: string): Promise<WhatsAppProviderResult> {
    const messageId = `wamid.mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const record = { to, message, timestamp: new Date().toISOString(), messageId };
    this.sentMessages.push(record);
    return {
      success: true,
      messageId,
      timestamp: record.timestamp,
      rawResponse: { status: 'sent', recipient: to, provider: this.name }
    };
  }

  async sendTemplate(to: string, templateName: string, language: string, components?: any[]): Promise<WhatsAppProviderResult> {
    const messageId = `wamid.tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      messageId,
      timestamp: new Date().toISOString(),
      rawResponse: { status: 'template_dispatched', template: templateName, language, recipient: to }
    };
  }

  async sendTicketNotification(
    to: string,
    ticketNumber: string,
    machineNumber: string,
    status: string,
    notes?: string
  ): Promise<WhatsAppProviderResult> {
    const text = `🛠️ *Vending Fleet Update*\nTicket: *${ticketNumber}*\nMachine: *${machineNumber}*\nStatus: *${status}*\n${notes ? `Note: ${notes}\n` : ''}Thank you for your report.`;
    return this.sendMessage(to, text);
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

export class WhatsAppCloudApiProvider implements IWhatsAppProvider {
  name = 'WhatsAppCloudApiProvider';
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion = 'v20.0';

  constructor(phoneNumberId?: string, accessToken?: string) {
    this.phoneNumberId = phoneNumberId || '';
    this.accessToken = accessToken || '';
  }

  async sendMessage(to: string, message: string): Promise<WhatsAppProviderResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        error: 'WhatsApp Business Cloud API credentials not configured. Please supply WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.'
      };
    }

    try {
      const sanitizedPhone = to.replace(/[^0-9]/g, '');
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: sanitizedPhone,
        type: 'text',
        text: { preview_url: false, body: message }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `HTTP ${res.status}: WhatsApp API dispatch failed`,
          rawResponse: data
        };
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
        timestamp: new Date().toISOString(),
        rawResponse: data
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error connecting to WhatsApp Cloud API'
      };
    }
  }

  async sendTemplate(to: string, templateName: string, language: string, components?: any[]): Promise<WhatsAppProviderResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        error: 'WhatsApp Business Cloud API credentials not configured.'
      };
    }

    try {
      const sanitizedPhone = to.replace(/[^0-9]/g, '');
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        to: sanitizedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language || 'en' },
          components: components || []
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `HTTP ${res.status}: Template dispatch failed`,
          rawResponse: data
        };
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
        timestamp: new Date().toISOString(),
        rawResponse: data
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Template dispatch failed'
      };
    }
  }

  async sendTicketNotification(
    to: string,
    ticketNumber: string,
    machineNumber: string,
    status: string,
    notes?: string
  ): Promise<WhatsAppProviderResult> {
    const text = `🛠️ *Vending Fleet Operations*\nTicket: *${ticketNumber}*\nMachine: *${machineNumber}*\nStatus: *${status}*\n${notes ? `Note: ${notes}\n` : ''}Thank you for your report.`;
    return this.sendMessage(to, text);
  }
}

export class WhatsAppServiceManager {
  private provider: IWhatsAppProvider;
  private verifyToken: string;
  private dispatchPhoneNumber: string;
  private isEnabled: boolean;

  constructor() {
    this.verifyToken = 'vending_ksu_whatsapp_verify_token_2026';
    this.dispatchPhoneNumber = '+966500000000';
    this.isEnabled = false;
    this.provider = new MockWhatsAppProvider();
  }

  configure(config: {
    enabled?: boolean;
    providerType?: 'mock' | 'cloud_api';
    phoneNumberId?: string;
    accessToken?: string;
    verifyToken?: string;
    dispatchPhone?: string;
  }) {
    if (config.enabled !== undefined) this.isEnabled = config.enabled;
    if (config.verifyToken) this.verifyToken = config.verifyToken;
    if (config.dispatchPhone) this.dispatchPhoneNumber = config.dispatchPhone;

    if (config.providerType === 'cloud_api' && config.phoneNumberId && config.accessToken) {
      this.provider = new WhatsAppCloudApiProvider(config.phoneNumberId, config.accessToken);
    } else {
      this.provider = new MockWhatsAppProvider();
    }
  }

  getProvider(): IWhatsAppProvider {
    return this.provider;
  }

  getDispatchPhoneNumber(): string {
    return this.dispatchPhoneNumber;
  }

  getVerifyToken(): string {
    return this.verifyToken;
  }

  isWhatsAppEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Generates a safe WhatsApp deep link containing ONLY the public machine identifier.
   * Never leaks internal DB ids, JWTs, or secrets.
   */
  generateWhatsAppDeepLink(publicQrId: string, machineNumber?: string): string {
    const targetPhone = this.dispatchPhoneNumber.replace(/[^0-9]/g, '');
    const cleanMachine = (machineNumber || publicQrId || 'Vending Machine').trim();
    const cleanQr = (publicQrId || '').trim();
    
    const message = `Hello, I want to report a problem with vending machine ${cleanMachine} (ID: ${cleanQr}).`;
    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Validates Meta Webhook Verification challenge (GET /webhook)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Extracts safe machine identifiers from customer incoming text
   */
  extractMachineIdentifier(text: string): string | null {
    if (!text) return null;
    
    // Check for QR ID pattern (e.g. QR-A8B9C0-KSU-01 or QR-XXXXXX-KSU-XXXX)
    const qrMatch = text.match(/QR-[A-Z0-9]+-KSU-[0-9A-Z]+/i);
    if (qrMatch) return qrMatch[0].toUpperCase();

    // Check for standard machine code (e.g. VM-B01-F01-01 or VM-101)
    const vmMatch = text.match(/VM-[A-Z0-9-]+/i);
    if (vmMatch) return vmMatch[0].toUpperCase();

    // Check for generic ID format (e.g. ID: QR-XXXX)
    const idMatch = text.match(/ID:\s*([A-Z0-9-]+)/i);
    if (idMatch) return idMatch[1].toUpperCase();

    return null;
  }

  /**
   * Parses customer message text to infer fault category & priority
   */
  categorizeCustomerFault(text: string): { category: FaultCategory; priority: TicketPriority } {
    const lower = (text || '').toLowerCase();

    if (lower.includes('power') || lower.includes('black') || lower.includes('screen off') || lower.includes('dead') || lower.includes('طافية') || lower.includes('كهرباء')) {
      return { category: 'POWER', priority: 'CRITICAL' };
    }
    if (lower.includes('leak') || lower.includes('water') || lower.includes('flood') || lower.includes('تسريب') || lower.includes('موية')) {
      return { category: 'LEAK', priority: 'CRITICAL' };
    }
    if (lower.includes('warm') || lower.includes('hot') || lower.includes('temperature') || lower.includes('cooling') || lower.includes('refrigeration') || lower.includes('تبريد') || lower.includes('حار')) {
      return { category: 'TEMPERATURE', priority: 'CRITICAL' };
    }
    if (lower.includes('pos') || lower.includes('mada') || lower.includes('apple pay') || lower.includes('visa') || lower.includes('card') || lower.includes('payment') || lower.includes('دفع') || lower.includes('شبكة') || lower.includes('خصم')) {
      return { category: 'PAYMENT', priority: 'HIGH' };
    }
    if (lower.includes('stuck') || lower.includes('jam') || lower.includes('dispense') || lower.includes('fell') || lower.includes('انحشار') || lower.includes('ما نزل') || lower.includes('معلق')) {
      return { category: 'PRODUCT_NOT_DISPENSED', priority: 'HIGH' };
    }
    if (lower.includes('keypad') || lower.includes('button') || lower.includes('select') || lower.includes('زر') || lower.includes('اختيار')) {
      return { category: 'PRODUCT_SELECTION', priority: 'MEDIUM' };
    }
    if (lower.includes('empty') || lower.includes('out of stock') || lower.includes('خلص') || lower.includes('فارغ')) {
      return { category: 'OUT_OF_STOCK', priority: 'LOW' };
    }

    return { category: 'OTHER', priority: 'MEDIUM' };
  }
}

export const whatsAppService = new WhatsAppServiceManager();
