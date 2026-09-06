import React, { useState, useEffect } from 'react';
import {
  QrCode,
  AlertTriangle,
  CheckCircle2,
  Send,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  Phone,
  HelpCircle,
  CreditCard,
  Flame,
  Droplets,
  Layers,
  Power,
  RotateCcw,
  RefreshCw,
  Info,
  Check,
  Headphones,
  Wrench,
  Package,
  UserCheck,
  FileText,
  Camera,
  CheckCircle,
  User,
  BadgeAlert,
  ArrowRight,
  Sparkles,
  Truck,
  Activity,
  History,
  Radio,
  Sliders,
  ChevronRight,
  ExternalLink,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  Edit3,
  AlertCircle,
  Lock,
  KeyRound
} from 'lucide-react';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { NavigationTab, FaultCategory, TicketPriority, Machine, SparePart, Ticket } from '../../types';
import { api } from '../../services/api';

// Safe rendering helpers to prevent "Objects are not valid as a React child" errors
const getPartCategoryName = (p: any): string => {
  if (!p) return 'عام';
  if (typeof p.category === 'string') return p.category;
  if (typeof p.category === 'object' && p.category !== null) {
    return p.category.nameAr || p.category.name || p.category.title || 'عام';
  }
  if (typeof p.categoryName === 'string') return p.categoryName;
  return 'عام';
};

const safeRender = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    return val.nameAr || val.name || val.titleAr || val.title || val.description || fallback;
  }
  return String(val);
};

interface PublicTicketPortalProps {
  initialMachineNumber?: string;
  onNavigate?: (tab: NavigationTab, id?: string) => void;
}

type PortalMode = 'CUSTOMER' | 'TECHNICIAN' | 'PART_REQUEST';
type TechActionTab = 'MAINTENANCE' | 'PART_REQUEST';

export const PublicTicketPortal: React.FC<PublicTicketPortalProps> = ({
  initialMachineNumber,
  onNavigate
}) => {
  const { t, formatDate, isRTL } = useLanguage();
  const { showToast } = useNotification();

  // Helper to extract machine identifier and mode from URL query parameters or hash
  const getInitialParams = () => {
    let rawInput = initialMachineNumber || '';
    let machine = '';
    let mode: PortalMode = 'CUSTOMER';

    // Check if initialMachineNumber itself contains query params e.g. "101?mode=technician"
    if (rawInput.includes('?')) {
      const [m, q] = rawInput.split('?');
      machine = decodeURIComponent(m || '').trim();
      const qParams = new URLSearchParams(q);
      const mMode = qParams.get('mode') || qParams.get('role') || qParams.get('tab');
      if (mMode && (mMode.toLowerCase().includes('part') || mMode.toLowerCase().includes('spare'))) {
        mode = 'PART_REQUEST';
      } else if (mMode && mMode.toLowerCase().includes('tech')) {
        mode = 'TECHNICIAN';
      }
    } else {
      machine = decodeURIComponent(rawInput).trim();
    }

    if (typeof window !== 'undefined') {
      try {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const urlId = params.get('machineId') || params.get('machine') || params.get('qr') || params.get('id');
        if (urlId) machine = decodeURIComponent(urlId).trim();

        const urlMode = params.get('mode') || params.get('role') || params.get('tab');
        if (urlMode && (urlMode.toLowerCase().includes('part') || urlMode.toLowerCase().includes('spare'))) {
          mode = 'PART_REQUEST';
        } else if (urlMode && urlMode.toLowerCase().includes('tech')) {
          mode = 'TECHNICIAN';
        }

        const hash = window.location.hash;
        if (hash && hash.includes('?')) {
          const hParams = new URLSearchParams(hash.split('?')[1] || '');
          const hm = hParams.get('machineId') || hParams.get('machine') || hParams.get('qr') || hParams.get('id');
          if (hm) machine = decodeURIComponent(hm).trim();
          const hmMode = hParams.get('mode') || hParams.get('role') || hParams.get('tab');
          if (hmMode && (hmMode.toLowerCase().includes('part') || hmMode.toLowerCase().includes('spare'))) {
            mode = 'PART_REQUEST';
          } else if (hmMode && hmMode.toLowerCase().includes('tech')) {
            mode = 'TECHNICIAN';
          }
        }
      } catch {}
    }
    return { machine, mode };
  };

  const initialParams = getInitialParams();
  const [portalMode, setPortalMode] = useState<PortalMode>(initialParams.mode);
  const [machineIdentifier, setMachineIdentifier] = useState(initialParams.machine);
  const [publicMachine, setPublicMachine] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [allMachines, setAllMachines] = useState<Machine[]>([]);
  
  // Customer Reporting State
  const [selectedCategory, setSelectedCategory] = useState<FaultCategory>('CARD_POS');
  const [description, setDescription] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketNumber: string;
    machineNumber: string;
    machineType: string;
    locationDesc: string;
    category: string;
    categoryTitleAr: string;
    createdAt: string;
    status: string;
  } | null>(null);

  // Field Technician State
  const [registeredTechnicians, setRegisteredTechnicians] = useState<any[]>([]);
  const [availableSpareParts, setAvailableSpareParts] = useState<any[]>([]);
  const [openTicketsOnMachine, setOpenTicketsOnMachine] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('ALL_OR_NEW');
  const [techActionTab, setTechActionTab] = useState<TechActionTab>('MAINTENANCE');

  // Technician Identity - STRICT MANUAL ENTRY (No auto-fill, no localStorage persistence)
  const [techIdentity, setTechIdentity] = useState<{
    id?: string;
    fullName: string;
    employeeCode: string;
    phone: string;
    specialization: string;
  }>({
    id: '',
    fullName: '',
    employeeCode: '',
    phone: '',
    specialization: 'فني صيانة وإصلاح ميداني'
  });

  const [techCodeVerified, setTechCodeVerified] = useState(false);

  // Clear any existing stored technician data on mount to prevent any auto-fill
  useEffect(() => {
    try {
      localStorage.removeItem('vending_fleet_field_tech');
    } catch {}
  }, []);

  // Technician Maintenance Action Fields
  const [actionTypeTitle, setActionTypeTitle] = useState('فحص وتشخيص العطل الميداني');
  const [actionDescription, setActionDescription] = useState('');
  const [actionRootCause, setActionRootCause] = useState('عطل ميكانيكي / برمجي تم التعامل معه');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [newTicketStatus, setNewTicketStatus] = useState<'IN_PROGRESS' | 'RESOLVED' | 'WAITING_FOR_PART' | 'CLOSED'>('RESOLVED');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsVerified, setGpsVerified] = useState(false);

  // Technician Spare Part Request Fields
  const [selectedPartId, setSelectedPartId] = useState('sp-001');
  const [partSearchQuery, setPartSearchQuery] = useState('');
  const [isCustomPart, setIsCustomPart] = useState(false);
  const [customPartName, setCustomPartName] = useState('');
  const [customPartNumber, setCustomPartNumber] = useState('');
  const [customPartCategory, setCustomPartCategory] = useState('ELECTRONICS');
  const [partQuantity, setPartQuantity] = useState(1);
  const [partPriority, setPartPriority] = useState<TicketPriority>('HIGH');
  const [partReason, setPartReason] = useState('');
  const [partNotes, setPartNotes] = useState('');

  // Technician Submission Confirmation
  const [techSubmittedResult, setTechSubmittedResult] = useState<{
    success: boolean;
    message: string;
    technicianName: string;
    employeeCode: string;
    machineNumber: string;
    ticketNumber: string;
    actionType: string;
    newStatus: string;
    timestamp: string;
    partRequestNumber?: string;
  } | null>(null);

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [supportSettings, setSupportSettings] = useState<{
    supportPhone: string;
    supportEmail: string;
    supportHoursAr: string;
  }>({
    supportPhone: '800-123-4567',
    supportEmail: 'support@vendingfleet.com',
    supportHoursAr: 'خدمة العملاء على مدار 24 ساعة طوال أيام الأسبوع'
  });

  const defaultCatalogParts = [
    { id: 'sp-001', partNumber: 'SP-POS-01', name: 'جهاز دفع إلكتروني ومدى (POS Terminal)', category: 'PAYMENT', currentStock: 8, unitCost: 350 },
    { id: 'sp-002', partNumber: 'SP-BILL-02', name: 'قارئ العملات الورقية (Bill Acceptor)', category: 'PAYMENT', currentStock: 5, unitCost: 400 },
    { id: 'sp-003', partNumber: 'SP-COIN-03', name: 'وحدة العملات المعدنية (Coin Changer)', category: 'PAYMENT', currentStock: 6, unitCost: 280 },
    { id: 'sp-004', partNumber: 'SP-MOT-04', name: 'موتور السحب الحلزوني (Spiral Coil Motor 24V)', category: 'MECHANICAL', currentStock: 24, unitCost: 95 },
    { id: 'sp-005', partNumber: 'SP-DROP-05', name: 'حساس سقوط المنتجات بالأشعة (Drop Sensor Board)', category: 'ELECTRONIC', currentStock: 12, unitCost: 160 },
    { id: 'sp-006', partNumber: 'SP-KEY-06', name: 'لوحة المفاتيح والأزرار (Keypad Membrane)', category: 'INTERFACE', currentStock: 10, unitCost: 110 },
    { id: 'sp-007', partNumber: 'SP-DISP-07', name: 'شاشة العرض الرئيسية (LCD Display Screen)', category: 'INTERFACE', currentStock: 7, unitCost: 220 },
    { id: 'sp-008', partNumber: 'SP-FAN-08', name: 'مروحة تبريد وتوزيع الهواء (Cooling Evaporator Fan)', category: 'REFRIGERATION', currentStock: 9, unitCost: 140 },
    { id: 'sp-009', partNumber: 'SP-COMP-09', name: 'ضاغط التبريد وغاز R134a (Refrigeration Compressor)', category: 'REFRIGERATION', currentStock: 3, unitCost: 850 },
    { id: 'sp-010', partNumber: 'SP-PWR-10', name: 'وحدة التغذية والباور سبلاي (Power Supply 24V/12V)', category: 'ELECTRICAL', currentStock: 15, unitCost: 190 },
    { id: 'sp-011', partNumber: 'SP-LOCK-11', name: 'قفل الباب الرئيسي والمفتاح الأمني (Security Door Lock)', category: 'ACCESS', currentStock: 14, unitCost: 80 },
    { id: 'sp-012', partNumber: 'SP-BELT-12', name: 'سير وموجه خروج العبوات (Conveyor Belt Assembly)', category: 'MECHANICAL', currentStock: 4, unitCost: 210 }
  ];

  // Load machines & settings for portal
  useEffect(() => {
    api.getMachines().then(res => {
      if (Array.isArray(res)) setAllMachines(res);
    }).catch(() => {});

    api.getSettings().then(s => {
      if (s) {
        setSupportSettings({
          supportPhone: s.supportPhone || '800-123-4567',
          supportEmail: s.supportEmail || 'support@vendingfleet.com',
          supportHoursAr: s.supportHoursAr || 'خدمة العملاء على مدار 24 ساعة طوال أيام الأسبوع'
        });
      }
    }).catch(() => {});

    api.getTechnicians().then(techs => {
      if (Array.isArray(techs) && techs.length > 0) {
        setRegisteredTechnicians(techs);
      }
    }).catch(() => {});

    api.getSpareParts().then(parts => {
      if (Array.isArray(parts) && parts.length > 0) {
        const active = parts.filter(p => p.status !== 'INACTIVE');
        setAvailableSpareParts(active.length > 0 ? active : defaultCatalogParts);
        if (active.length > 0) setSelectedPartId(active[0].id);
      } else {
        setAvailableSpareParts(defaultCatalogParts);
        setSelectedPartId(defaultCatalogParts[0].id);
      }
    }).catch(() => {
      setAvailableSpareParts(defaultCatalogParts);
      setSelectedPartId(defaultCatalogParts[0].id);
    });
  }, []);

  // Sync prop changes
  useEffect(() => {
    if (initialMachineNumber) {
      if (initialMachineNumber.includes('?')) {
        const [cleanNum, qs] = initialMachineNumber.split('?');
        setMachineIdentifier(cleanNum);
        const params = new URLSearchParams(qs);
        const modeP = params.get('mode') || params.get('role') || params.get('tab');
        if (modeP && (modeP.toLowerCase().includes('part') || modeP.toLowerCase().includes('spare'))) {
          setPortalMode('PART_REQUEST');
          setTechActionTab('PART_REQUEST');
        } else if (modeP === 'technician') {
          setPortalMode('TECHNICIAN');
        } else if (modeP === 'customer') {
          setPortalMode('CUSTOMER');
        }
      } else {
        setMachineIdentifier(initialMachineNumber);
      }
    }
  }, [initialMachineNumber]);

  const faultCategories: Array<{
    id: FaultCategory;
    title: string;
    titleAr: string;
    description: string;
    descriptionAr: string;
    icon: any;
    priority: TicketPriority;
    color: string;
  }> = [
    {
      id: 'CARD_POS',
      title: 'POS / Card Payment',
      titleAr: 'عطل الدفع الإلكتروني / مدى / فيزا',
      description: 'Card tapped/swiped but payment failed or amount deducted without item',
      descriptionAr: 'تم تمرير البطاقة وتم الخصم أو رُفضت العملية دون خروج المنتج',
      icon: CreditCard,
      priority: 'HIGH',
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    },
    {
      id: 'NO_PRODUCT',
      title: 'Product Jammed / Stuck',
      titleAr: 'انحشار المنتج / لم يسقط في الدرج',
      description: 'Spiral turned but item remained stuck or tray didn\'t release',
      descriptionAr: 'دار المحرك الحلزوني وعلق المنتج في الماكينة ولم ينزل',
      icon: AlertTriangle,
      priority: 'HIGH',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    },
    {
      id: 'PRODUCT_SELECTION',
      title: 'Keypad / Selection Buttons',
      titleAr: 'لوحة الأزرار / أزرار الاختيار',
      description: 'Keypad numbers not registering or screen shows "Selection Invalid"',
      descriptionAr: 'الأرقام لا تستجيب أو تظهر رسالة اختيار غير متاح',
      icon: Layers,
      priority: 'MEDIUM',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    },
    {
      id: 'REFRIGERATION',
      title: 'Refrigeration / Temperature',
      titleAr: 'وحدة التبريد / المشروبات دافئة',
      description: 'Beverages not cold, compressor noise, or cooling failure',
      descriptionAr: 'المشروبات غير مبردة أو صوت التبريد غير طبيعي',
      icon: Flame,
      priority: 'CRITICAL',
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    },
    {
      id: 'POWER',
      title: 'Power / Screen Turned Off',
      titleAr: 'انقطاع الكهرباء / الشاشة سوداء',
      description: 'Machine is completely dead, screen dark, or lights off',
      descriptionAr: 'الماكينة طافية تماماً ولا توجد إضاءة أو شاشة',
      icon: Power,
      priority: 'CRITICAL',
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    },
    {
      id: 'LEAK',
      title: 'Liquid / Water Leak',
      titleAr: 'تسريب مياه أو سوائل أسفل الماكينة',
      description: 'Water or liquid leaking from bottom tray onto floor',
      descriptionAr: 'وجود بركة ماء أو تسريب سائل من أسفل الماكينة',
      icon: Droplets,
      priority: 'CRITICAL',
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
    },
    {
      id: 'OTHER',
      title: 'Other Issue / Cleanliness / Refund',
      titleAr: 'أعطال أخرى / النظافة واسترجاع المبالغ',
      description: 'General inquiry, hygiene report, or balance refund request',
      descriptionAr: 'ملاحظات عامة، نظافة الماكينة، أو طلب استرجاع رصيد',
      icon: HelpCircle,
      priority: 'LOW',
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    }
  ];

  const maintenanceActionPresets = [
    { title: 'فحص وتشخيص أولي للمنظومة', defaultDesc: 'تم فحص المكونات واختبار الحساسات ودورة التشغيل والتأكد من سلامة التوصيلات.' },
    { title: 'إزالة انحشار المنتج وضبط المحرك الحلزوني', defaultDesc: 'تم فتح الماكينة وتفريغ المنتج العالق واختبار خروج المنتجات بنجاح في الأدراج.' },
    { title: 'إعادة تشغيل وتحديث قارئ مدى / POS', defaultDesc: 'تم عمل دورة إعادة تشغيل لوحدة الدفع واختبار عملية شراء وهمية والتأكد من الاتصال بالشبكة.' },
    { title: 'فحص وتنظيف وحدة التبريد وضبط الترموستات', defaultDesc: 'تم تنظيف مجرى الهواء والمكثف وضبط درجة حرارة التبريد على الدرجة المثالية (4°C).' },
    { title: 'نظافة وتعقيم دوري وصيانة وقائية', defaultDesc: 'تم تعقيم فتحات تسليم المنتجات ومسح الواجهة الزجاجية والشاشة ولوحة المفاتيح بالكامل.' },
    { title: 'استبدال مكون ميكانيكي / كهربائي تالف', defaultDesc: 'تم استبدال الجزء التالف وفحص الوظيفة التشغيلية تحت الحمل الكامل بنجاح.' },
    { title: 'إعادة ضبط ومعايرة المخزون الداخلي', defaultDesc: 'تمت مطابقة كميات المنتجات الفعلية وتحديث مؤشرات الحساسات.' }
  ];

  // Fetch full machine status when identifier changes
  useEffect(() => {
    let active = true;
    const fetchSafeMachine = async () => {
      const trimmed = machineIdentifier.trim();
      if (!trimmed) {
        if (active) {
          setPublicMachine(null);
          setOpenTicketsOnMachine([]);
          setIsSearching(false);
        }
        return;
      }

      setIsSearching(true);
      try {
        const fullData = await api.getMachineFullStatusByQr(trimmed);
        if (active && fullData && fullData.machine) {
          setPublicMachine(fullData.machine);
          setOpenTicketsOnMachine(fullData.openTickets || []);
          if (Array.isArray(fullData.spareParts) && fullData.spareParts.length > 0) {
            setAvailableSpareParts(fullData.spareParts);
            if (!selectedPartId) setSelectedPartId(fullData.spareParts[0].id);
          }
          if (Array.isArray(fullData.technicians) && fullData.technicians.length > 0) {
            setRegisteredTechnicians(fullData.technicians);
          }
        } else {
          // Fallback to basic lookup
          const found = await api.getMachineByPublicQrId(trimmed);
          if (active) {
            setPublicMachine(found);
          }
        }
      } catch {
        if (active) setPublicMachine(null);
      } finally {
        if (active) setIsSearching(false);
      }
    };

    fetchSafeMachine();

    return () => {
      active = false;
    };
  }, [machineIdentifier]);

  // Capture GPS Location for technician on-site verification
  const handleVerifyGps = () => {
    if (!navigator.geolocation) {
      showToast(t('info'), 'خاصية تحديد الموقع غير مدعومة في هذا المتصفح، سيتم اعتماد المسح الضوئي للـ QR', 'info');
      setGpsVerified(true);
      return;
    }

    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsVerified(true);
        setIsGettingGps(false);
        showToast(t('success'), 'تم التحقق من التواجد الميداني بجوار الماكينة عبر GPS', 'success');
      },
      () => {
        setGpsVerified(true);
        setIsGettingGps(false);
        showToast(t('info'), 'تم توثيق التواجد الميداني عبر مسح كود QR الفعلي للماكينة', 'info');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Handle Employee Code input with automatic lookup and manual verification
  const handleEmployeeCodeChange = (code: string) => {
    const raw = code;
    const clean = code.trim().toUpperCase();
    
    // Check if code matches any registered technician
    const matched = clean.length >= 2 ? registeredTechnicians.find((t: any) => {
      if (!t) return false;
      const tCode = (t.employeeCode || '').toString().toUpperCase().trim();
      const tId = (t.id || '').toString().toUpperCase().trim();
      return tCode === clean || tId === clean;
    }) : null;

    if (matched) {
      setTechIdentity({
        id: matched.id,
        employeeCode: matched.employeeCode || raw,
        fullName: matched.fullNameAr || matched.fullName || '',
        phone: matched.phone || matched.phoneNumber || '',
        specialization: matched.specialization || 'فني صيانة وإصلاح ميداني'
      });
      setTechCodeVerified(true);
    } else {
      setTechIdentity(prev => ({
        ...prev,
        employeeCode: raw
      }));
      setTechCodeVerified(false);
    }
  };

  const handleVerifyCodeManually = () => {
    const clean = techIdentity.employeeCode.trim().toUpperCase();
    if (!clean) {
      showToast(t('error'), 'يرجى إدخال الرمز الوظيفي السري للفني أولاً', 'error');
      return;
    }
    const matched = registeredTechnicians.find((t: any) => {
      if (!t) return false;
      const tCode = (t.employeeCode || '').toString().toUpperCase().trim();
      const tId = (t.id || '').toString().toUpperCase().trim();
      return tCode === clean || tId === clean;
    });

    if (matched) {
      setTechIdentity({
        id: matched.id,
        employeeCode: matched.employeeCode || techIdentity.employeeCode,
        fullName: matched.fullNameAr || matched.fullName || '',
        phone: matched.phone || matched.phoneNumber || '',
        specialization: matched.specialization || 'فني صيانة وإصلاح ميداني'
      });
      setTechCodeVerified(true);
      showToast(t('success'), `تم التحقق واعتماد الهوية بنجاح: ${matched.fullNameAr || matched.fullName}`, 'success');
    } else {
      setTechCodeVerified(false);
      showToast(t('info'), 'الرمز المدخل غير مسجل مسبقاً، يرجى استكمال كتابة الاسم ورقم الجوال للمتابعة الميدانية', 'info');
    }
  };

  const handleResetTechIdentity = () => {
    try {
      localStorage.removeItem('vending_fleet_field_tech');
    } catch {}
    setTechIdentity({
      id: '',
      fullName: '',
      employeeCode: '',
      phone: '',
      specialization: 'فني صيانة وإصلاح ميداني'
    });
    setTechCodeVerified(false);
    showToast(t('info'), 'تم تفريغ حقول بيانات الفني', 'info');
  };

  // Customer Submit Handler
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicMachine) {
      showToast(t('error'), 'يرجى تحديد رقم الماكينة أولاً للتمكن من تسجيل البلاغ', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const selected = faultCategories.find(c => c.id === selectedCategory);
      const descFull = description.trim() 
        ? `${selected?.titleAr || selected?.title} - ${description.trim()}`
        : `${selected?.titleAr || selected?.title} (بلاغ عميل عبر رمز QR)`;

      const ticket = await api.submitPublicQrTicket({
        publicQrId: publicMachine.machineNumber || publicMachine.publicQrId || publicMachine.publicId,
        category: selectedCategory,
        description: descFull,
        reporterPhone: reporterPhone.trim() || undefined,
        reporterEmail: reporterEmail.trim() || undefined
      });

      setSubmittedTicket({
        ticketNumber: ticket.ticketNumber,
        machineNumber: publicMachine.machineNumber,
        machineType: publicMachine.machineType || 'ماكينة بيع ذاتي',
        locationDesc: publicMachine.locationDescription || publicMachine.buildingName || 'موقع الماكينة',
        category: selected?.title || selectedCategory,
        categoryTitleAr: selected?.titleAr || selectedCategory,
        createdAt: new Date().toISOString(),
        status: 'قيد المتابعة والتوجيه للفني (NEW / DISPATCHED)'
      });

      showToast(t('success'), `تم تسجيل البلاغ بنجاح برقم: ${ticket.ticketNumber}`, 'success');
    } catch (err: any) {
      showToast(t('error'), err?.message || 'تعذر تسجيل البلاغ، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Field Technician Submit Handler
  const handleTechnicianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicMachine) {
      showToast(t('error'), 'يرجى تحديد أو مسح كود الماكينة أولاً', 'error');
      return;
    }

    let finalName = techIdentity.fullName.trim();
    let finalCode = techIdentity.employeeCode.trim();

    // Auto-resolve technician name from registered technicians if only code is entered
    if (!finalName && finalCode) {
      const matched = registeredTechnicians.find((t: any) => {
        if (!t) return false;
        const tCode = (t.employeeCode || '').toString().toUpperCase().trim();
        const tId = (t.id || '').toString().toUpperCase().trim();
        return tCode === finalCode.toUpperCase() || tId === finalCode.toUpperCase();
      });
      if (matched) {
        finalName = matched.fullNameAr || matched.fullName;
      }
    }

    if (!finalName && !finalCode) {
      showToast(t('error'), 'يرجى إدخال رمز الفني الوظيفي أو اختيار الفني لمتابعة الإجراء', 'error');
      return;
    }

    if (!finalName) {
      finalName = `فني صيانة (${finalCode || 'ميداني'})`;
    }

    setIsSubmitting(true);
    try {
      const selectedTicket = selectedTicketId !== 'ALL_OR_NEW' ? selectedTicketId : undefined;
      const isPartRequestAction = portalMode === 'PART_REQUEST' || techActionTab === 'PART_REQUEST';

      let payload: any = {
        publicQrId: publicMachine.machineNumber || publicMachine.publicQrId || publicMachine.publicId,
        machineId: publicMachine.id,
        technician: {
          id: techIdentity.id || undefined,
          fullName: finalName,
          employeeCode: finalCode || `TECH-${Math.floor(1000 + Math.random() * 9000)}`,
          phone: techIdentity.phone.trim() || undefined,
          specialization: techIdentity.specialization
        },
        ticketId: selectedTicket,
        gpsLocation: gpsLocation || undefined
      };

      if (!isPartRequestAction) {
        payload.actionType = 'MAINTENANCE_ACTION';
        payload.maintenanceDetails = {
          actionTypeTitle: actionTypeTitle,
          description: actionDescription.trim() || `${actionTypeTitle} - تم تنفيذ الصيانة الميدانية بالكامل.`,
          rootCause: actionRootCause.trim() || 'فحص واختبار ميداني',
          durationMinutes: Number(durationMinutes) || 25,
          newTicketStatus: newTicketStatus
        };
      } else {
        payload.actionType = 'PART_REQUEST';
        const effectiveParts = availableSpareParts.length > 0 ? availableSpareParts : defaultCatalogParts;
        
        if (isCustomPart) {
          if (!customPartName.trim()) {
            showToast(t('error'), 'يرجى كتابة اسم أو وصف قطعة الغيار المطلوبة', 'error');
            setIsSubmitting(false);
            return;
          }
          payload.partRequestDetails = {
            sparePartId: 'sp-custom',
            customPartName: customPartName.trim(),
            customPartNumber: customPartNumber.trim() || undefined,
            customPartCategory: customPartCategory,
            isCustomPart: true,
            quantity: Math.max(1, Number(partQuantity) || 1),
            priority: partPriority,
            reason: partReason.trim() || `طلب قطعة غيار مخصصة (${customPartName.trim()}) للماكينة #${publicMachine.machineNumber}`,
            notes: partNotes.trim() || undefined
          };
        } else {
          const chosenPart = effectiveParts.find(p => p.id === selectedPartId) || effectiveParts[0];
          payload.partRequestDetails = {
            sparePartId: selectedPartId || chosenPart?.id,
            partName: chosenPart?.nameAr || chosenPart?.name,
            partNumber: chosenPart?.partNumber,
            quantity: Math.max(1, Number(partQuantity) || 1),
            priority: partPriority,
            reason: partReason.trim() || `طلب توريد قطعة غيار ${chosenPart?.name || ''} عبر QR الميداني للماكينة #${publicMachine.machineNumber}`,
            notes: partNotes.trim() || undefined
          };
        }
      }

      const result = await api.submitTechnicianQrAction(payload);

      setTechSubmittedResult({
        success: true,
        message: result.message || 'تم توثيق الإجراء بنجاح في قاعدة البيانات',
        technicianName: finalName,
        employeeCode: finalCode || result.technician?.employeeCode,
        machineNumber: publicMachine.machineNumber,
        ticketNumber: result.ticket?.ticketNumber || 'TCK-ON-SITE',
        actionType: isPartRequestAction ? `طلب قطعة غيار (${payload.partRequestDetails?.quantity}x)` : actionTypeTitle,
        newStatus: result.ticket?.status || (isPartRequestAction ? 'WAITING_FOR_PART' : newTicketStatus),
        timestamp: new Date().toISOString(),
        partRequestNumber: result.partRequest?.requestNumber
      });

      showToast(t('success'), 'تم إرسال وتوثيق إجراءات الفني في قاعدة البيانات بنجاح', 'success');
    } catch (err: any) {
      showToast(t('error'), err?.message || 'حدث خطأ أثناء حفظ الإجراء، يرجى المحاولة ثانية', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!submittedTicket?.ticketNumber) return;
    setIsCheckingStatus(true);
    try {
      const tck = await api.getTicketById(submittedTicket.ticketNumber);
      if (tck) {
        let statusAr = 'قيد المتابعة والتوجيه للفني';
        if (tck.status === 'ASSIGNED') statusAr = 'تم تعيين فني صيانة ميداني';
        if (tck.status === 'IN_PROGRESS') statusAr = 'الفني في الموقع جاري الفحص والإصلاح';
        if (tck.status === 'WAITING_FOR_PART') statusAr = 'بانتظار توفير قطعة الغيار من المستودع';
        if (tck.status === 'RESOLVED' || tck.status === 'CLOSED') statusAr = 'تم إصلاح العطل والماكينة جاهزة للاستخدام';
        
        setSubmittedTicket(prev => prev ? { ...prev, status: `${statusAr} (${tck.status})` } : null);
        showToast(t('success'), `حالة البلاغ الحالية: ${statusAr}`, 'success');
      }
    } catch {
      showToast(t('info'), 'جاري معالجة البلاغ من قبل فريق العمليات', 'info');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 sm:py-8 px-4 sm:px-6 lg:px-8 font-sans selection:bg-blue-600 selection:text-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Portal Header */}
        <header className="text-center space-y-3 pb-2 border-b border-slate-800/80">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/5">
            <QrCode className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
              {portalMode === 'CUSTOMER'
                ? 'بوابة بلاغات أعطال مكائن البيع الذاتي'
                : portalMode === 'PART_REQUEST'
                ? 'بوابة طلب وتوريد قطع الغيار الميدانية'
                : 'بوابة الفني الميداني وتوثيق الصيانة عبر QR'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">
              {portalMode === 'CUSTOMER'
                ? 'Vending Machine Public Incident & Fault Reporting Portal'
                : portalMode === 'PART_REQUEST'
                ? 'Field Spare Parts Warehouse Requisition & Supply Order'
                : 'Smart Field Technician Maintenance & Verification Dispatch'}
            </p>
          </div>

          {/* Mode Switcher Tabs - 3 Main Navigation Modes */}
          <div className="flex items-center justify-center pt-2">
            <div className="inline-flex flex-wrap items-center justify-center p-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-inner gap-1">
              <button
                type="button"
                onClick={() => {
                  setPortalMode('CUSTOMER');
                  setSubmittedTicket(null);
                  setTechSubmittedResult(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  portalMode === 'CUSTOMER'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-4 h-4" />
                <span>وضع العميل (تسجيل بلاغ)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalMode('TECHNICIAN');
                  setTechActionTab('MAINTENANCE');
                  setSubmittedTicket(null);
                  setTechSubmittedResult(null);
                  if (!gpsVerified) handleVerifyGps();
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  portalMode === 'TECHNICIAN'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>بوابة الفني (توثيق صيانة)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalMode('PART_REQUEST');
                  setTechActionTab('PART_REQUEST');
                  setSubmittedTicket(null);
                  setTechSubmittedResult(null);
                  if (!gpsVerified) handleVerifyGps();
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  portalMode === 'PART_REQUEST'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>طلب قطعة غيار (للمستودع)</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-400/20 text-indigo-300 border border-indigo-400/30">
                  Parts
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* ======================================================== */}
        {/* MODE 1: CUSTOMER PORTAL                                 */}
        {/* ======================================================== */}
        {portalMode === 'CUSTOMER' && (
          <>
            {submittedTicket ? (
              <main className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-sm animate-fade-in text-right">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 shadow-xl shadow-emerald-500/10 animate-bounce">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-100">
                    تم تسجيل البلاغ بنجاح وجاري التوجيه
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                    شكراً لتعاونك. تم تسجيل البلاغ في نظام الصيانة المركزي، وفريق الدعم الفني في طريقه لمعالجة المشكلة.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-800 text-center sm:text-right">
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-0.5">رقم تتبع البلاغ (Reference Ticket)</span>
                      <span className="text-2xl font-mono font-black text-blue-400 tracking-wider">
                        {submittedTicket.ticketNumber}
                      </span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono font-bold text-xs">
                      {submittedTicket.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">رقم الماكينة المسجلة:</span>
                      <span className="text-slate-100 font-mono font-bold text-sm text-emerald-400">
                        {submittedTicket.machineNumber}
                      </span>
                      <span className="text-slate-400 text-[11px] block mt-0.5">{submittedTicket.machineType}</span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">موقع الماكينة:</span>
                      <span className="text-slate-200 font-medium leading-tight block">
                        {submittedTicket.locationDesc}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">نوع المشكلة المسجلة:</span>
                      <span className="text-slate-200 font-semibold block">
                        {submittedTicket.categoryTitleAr}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">وقت الاستجابة المتوقع (SLA):</span>
                      <span className="text-amber-400 font-bold block">
                        أقل من 45 دقيقة (فني ميداني متجول)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="md"
                      icon={RotateCcw}
                      onClick={() => {
                        setSubmittedTicket(null);
                        setDescription('');
                        setReporterPhone('');
                        setReporterEmail('');
                      }}
                      className="w-full sm:w-auto"
                    >
                      تسجيل بلاغ جديد / عطل آخر
                    </Button>

                    <Button
                      variant="primary"
                      size="md"
                      icon={RefreshCw}
                      isLoading={isCheckingStatus}
                      onClick={handleCheckStatus}
                      className="w-full sm:w-auto"
                    >
                      تحديث حالة البلاغ المباشرة
                    </Button>
                  </div>

                  <div className="text-center p-3.5 rounded-xl bg-slate-950/80 border border-blue-500/30 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>للاستفسار المباشر، متابعة التذكرة، أو استرجاع المبالغ:</span>
                    </div>
                    <a
                      href={`tel:${supportSettings.supportPhone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg text-blue-300 font-bold font-mono text-xs transition-colors"
                      dir="ltr"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{supportSettings.supportPhone}</span>
                    </a>
                  </div>
                </div>
              </main>
            ) : (
              <main className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 text-right">
                {/* 1. Machine Identification Section */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-blue-400" />
                      <span>رقم الماكينة أو كود الـ QR *</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Machine Number
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={machineIdentifier}
                      onChange={e => setMachineIdentifier(e.target.value)}
                      placeholder="أدخل رقم الماكينة المكتوب على الملصق (مثال: 101 أو VM-B01-F01-01)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-blue-500 shadow-inner"
                    />
                  </div>

                  {isSearching ? (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                      <span>جاري التحقق من بيانات الماكينة وموقعها في النظام...</span>
                    </div>
                  ) : publicMachine ? (
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 text-xs text-slate-300 space-y-2 shadow-inner">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-emerald-600/30 border border-emerald-500/50 rounded-lg font-bold font-mono text-sm text-emerald-300">
                            رقم الماكينة: {publicMachine.machineNumber}
                          </span>
                          <span className="text-slate-300 font-medium">({publicMachine.machineType})</span>
                        </div>
                        <StatusBadge type="machine" status={publicMachine.status} />
                      </div>

                      <div className="flex items-start gap-1.5 text-slate-300 text-xs pt-1 border-t border-emerald-500/20">
                        <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span><strong>الموقع:</strong> {publicMachine.locationDescription || publicMachine.buildingName}</span>
                      </div>
                    </div>
                  ) : machineIdentifier.trim() ? (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>لم يتم العثور على ماكينة برقم "{machineIdentifier}". يرجى التحقق من الرقم أو الاختيار من القائمة:</span>
                      </div>
                      {allMachines.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
                          {allMachines.slice(0, 15).map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setMachineIdentifier(m.machineNumber)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-blue-600 hover:text-white text-xs font-mono text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                            >
                              {m.machineNumber} ({m.currentLocation?.building?.name || 'مبنى'})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>

                {/* 2. Problem Category Selection */}
                <section className="space-y-2.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-200 block">
                    حدد نوع العطل أو المشكلة التي واجهتها *
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {faultCategories.map(cat => {
                      const Icon = cat.icon;
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          type="button"
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`p-3 rounded-xl text-right text-xs transition-all border cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-blue-600/20 border-blue-500 text-slate-100 shadow-md ring-1 ring-blue-500/50'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`p-2 rounded-lg ${cat.color} shrink-0 mt-0.5`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-100 text-xs sm:text-sm">{cat.titleAr}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{cat.descriptionAr}</div>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 3. Description text area */}
                <section className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    تفاصيل إضافية / رقم المنتج / المبلغ المخصوم (اختياري)
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="مثال: تم خصم مبلغ 6 ريال عبر مدى لشراء منتج رقم 14 ولم يسقط المنتج في الدرج..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none shadow-inner"
                  />
                </section>

                {/* 4. Reporter Contact Information */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 block">
                      رقم الجوال (لإشعارك بحالة الإصلاح واسترجاع المبالغ)
                    </label>
                    <input
                      type="tel"
                      value={reporterPhone}
                      onChange={e => setReporterPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono shadow-inner text-left"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 block">
                      البريد الإلكتروني (اختياري)
                    </label>
                    <input
                      type="email"
                      value={reporterEmail}
                      onChange={e => setReporterEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 shadow-inner text-left"
                      dir="ltr"
                    />
                  </div>
                </section>

                {/* Submit Button */}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    icon={Send}
                    isLoading={isSubmitting}
                    disabled={!publicMachine}
                    onClick={handleCustomerSubmit}
                  >
                    إرسال البلاغ إلى فريق الصيانة الميداني
                  </Button>
                </div>

                {/* Switch to Tech / Parts prompt */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <strong className="text-slate-100 block">هل أنت فني صيانة ميداني؟</strong>
                      <span className="text-[11px] text-slate-400">يمكنك توثيق إجراءات الإصلاح أو طلب قطع الغيار من المستودع مباشرة.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setPortalMode('TECHNICIAN');
                        setTechActionTab('MAINTENANCE');
                        if (!gpsVerified) handleVerifyGps();
                      }}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer text-center"
                    >
                      توثيق صيانة
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPortalMode('PART_REQUEST');
                        setTechActionTab('PART_REQUEST');
                        if (!gpsVerified) handleVerifyGps();
                      }}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer text-center"
                    >
                      طلب قطعة غيار
                    </button>
                  </div>
                </div>
              </main>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* MODE 2: FIELD TECHNICIAN PORTAL (QR DISPATCH & ACTIONS) */}
        {/* ======================================================== */}
        {portalMode === 'TECHNICIAN' && (
          <>
            {techSubmittedResult ? (
              <main className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl text-right animate-fade-in">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 shadow-xl shadow-emerald-500/10">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-100">
                    تم توثيق إجراء الفني بنجاح في قاعدة البيانات
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
                    تم تسجيل الإجراء الميداني وتحديث سجلات الصيانة والتذاكر وسجل التدقيق الزمني للماكينة فورياً.
                  </p>
                </div>

                {/* Summary Card */}
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-800 text-center sm:text-right">
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-0.5">رقم البلاغ / التذكرة المحدثة</span>
                      <span className="text-xl font-mono font-black text-amber-400 tracking-wider">
                        {techSubmittedResult.ticketNumber}
                      </span>
                    </div>
                    {techSubmittedResult.partRequestNumber && (
                      <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono font-bold text-xs">
                        طلب قطعة غيار: {techSubmittedResult.partRequestNumber}
                      </div>
                    )}
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-xs">
                      الحالة: {techSubmittedResult.newStatus}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">الفني المنفذ:</span>
                      <span className="text-slate-100 font-bold block text-sm text-blue-400">
                        {techSubmittedResult.technicianName} ({techSubmittedResult.employeeCode})
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">الماكينة:</span>
                      <span className="text-slate-100 font-mono font-bold block text-sm text-emerald-400">
                        #{techSubmittedResult.machineNumber}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">نوع الإجراء الموثق:</span>
                      <span className="text-slate-200 font-semibold block">
                        {techSubmittedResult.actionType}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">وقت وتاريخ التوثيق:</span>
                      <span className="text-slate-300 font-mono block" dir="ltr">
                        {new Date(techSubmittedResult.timestamp).toLocaleString('ar-SA')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    icon={RotateCcw}
                    onClick={() => {
                      setTechSubmittedResult(null);
                      setActionDescription('');
                      setPartReason('');
                      setPartNotes('');
                      setCustomPartName('');
                      setCustomPartNumber('');
                      setIsCustomPart(false);
                      setMachineIdentifier('');
                      setPublicMachine(null);
                      setOpenTicketsOnMachine([]);
                    }}
                    className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-bold"
                  >
                    تسجيل إجراء أو صيانة ماكينة أخرى
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    icon={FileText}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.print();
                      }
                    }}
                    className="w-full sm:w-auto border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    طباعة إيصال التوثيق الميداني
                  </Button>
                </div>
              </main>
            ) : (
              <main className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 text-right">
                
                {/* STEP 1: Technician Identity Verification - STRICT MANUAL CODE ENTRY */}
                <section className="p-4 sm:p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      <span>١. توثيق واعتماد الفني الميداني (إدخال الرمز السري يدوياً) *</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetTechIdentity}
                        className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>مسح الحقول</span>
                      </button>
                      {gpsVerified ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <Check className="w-3.5 h-3.5" />
                          <span>تم التحقق من الموقع</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleVerifyGps}
                          disabled={isGettingGps}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{isGettingGps ? 'جاري التحقق...' : 'تأكيد GPS'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>للحفاظ على السرية وضمان الموثوقية، يرجى كتابة الرمز الوظيفي الخاص بك مباشرة يدوياً.</span>
                  </div>

                  {/* Manual Fields: Code, Name, Phone */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          <span>الرمز الوظيفي السري للفني *</span>
                        </label>
                        {techCodeVerified ? (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            رمز معتمد ومربوط بقاعدة البيانات ✓
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            أدخل الرمز ثم اضغط تحقق
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            required
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={techIdentity.employeeCode}
                            onChange={e => handleEmployeeCodeChange(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleVerifyCodeManually();
                              }
                            }}
                            placeholder="أدخل رمز الفني الوظيفي (مثال: TECH-1042 أو EMP-001)"
                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 font-mono font-bold focus:outline-none shadow-inner"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleVerifyCodeManually}
                          className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>تحقق من الرمز</span>
                        </button>
                      </div>
                    </div>

                    {techCodeVerified && techIdentity.fullName && (
                      <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>الفني المعتمد: <strong>{techIdentity.fullName}</strong> ({techIdentity.specialization})</span>
                        </div>
                        <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-emerald-400 font-mono font-bold">
                          مُوثق
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          اسم الفني الرباعي *
                        </label>
                        <input
                          type="text"
                          required
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={techIdentity.fullName}
                          onChange={e => setTechIdentity(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="الاسم الكامل للفني..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          رقم جوال الفني
                        </label>
                        <input
                          type="tel"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={techIdentity.phone}
                          onChange={e => setTechIdentity(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="05XXXXXXXX"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500 text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* STEP 2: Machine Details & Active Tickets Board */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-amber-400" />
                      <span>٢. الماكينة المستهدفة والبلاغات المفتوحة *</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target Vending Machine
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={machineIdentifier}
                        onChange={e => setMachineIdentifier(e.target.value)}
                        placeholder="امسح الـ QR أو أدخل رقم الماكينة (مثال: 101 أو VM-B01-F01-01)"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500 shadow-inner"
                      />
                    </div>

                    {allMachines.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 shrink-0">أو اختر من الأسطول:</span>
                        <select
                          value={publicMachine ? (publicMachine.machineNumber || '') : ''}
                          onChange={e => setMachineIdentifier(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- قائمة جميع ماكينات الأسطول --</option>
                          {allMachines.map(m => (
                            <option key={m.id} value={m.machineNumber}>
                              #{m.machineNumber} - {m.currentLocation?.building?.name || m.currentLocation?.areaZone || 'Site'} ({m.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {isSearching ? (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>جاري جلب ملف الماكينة وتاريخ البلاغات...</span>
                    </div>
                  ) : publicMachine ? (
                    <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 text-xs space-y-3 shadow-inner">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-amber-600/30 border border-amber-500/50 rounded-lg font-bold font-mono text-sm text-amber-300">
                            ماكينة رقم: {publicMachine.machineNumber}
                          </span>
                          <span className="text-slate-300 font-medium">{publicMachine.machineType}</span>
                        </div>
                        <StatusBadge type="machine" status={publicMachine.status} />
                      </div>

                      <div className="flex items-start gap-1.5 text-slate-300 text-xs">
                        <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span><strong>الموقع الدقيق:</strong> {publicMachine.locationDescription || publicMachine.buildingName}</span>
                      </div>

                      {/* Active Tickets for this machine */}
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5">
                            <BadgeAlert className="w-4 h-4 text-rose-400" />
                            <span>البلاغات الحالية على هذه الماكينة ({openTicketsOnMachine.length}):</span>
                          </span>
                        </div>

                        {openTicketsOnMachine.length > 0 ? (
                          <div className="space-y-2">
                            {openTicketsOnMachine.map((tck: any) => {
                              const isSelected = selectedTicketId === tck.id || selectedTicketId === tck.ticketNumber;
                              return (
                                <div
                                  key={tck.id}
                                  className={`p-3 rounded-lg border transition-all space-y-2 ${
                                    isSelected
                                      ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/40'
                                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-blue-400 text-xs">{tck.ticketNumber}</span>
                                      <StatusBadge type="ticket" status={tck.status} />
                                      <span className="text-[10px] text-slate-400">{safeRender(tck.category, 'عام')}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">{formatDate(tck.createdAt)}</span>
                                  </div>

                                  <p className="text-xs text-slate-200 font-medium leading-relaxed">
                                    {tck.description || tck.title}
                                  </p>

                                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
                                    <span className="text-slate-400">
                                      المبلغ: {tck.reporterName || tck.reportedBy || 'عميل عبر QR'}
                                    </span>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedTicketId(tck.id);
                                          setTechActionTab('MAINTENANCE');
                                        }}
                                        className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                          isSelected && techActionTab === 'MAINTENANCE'
                                            ? 'bg-amber-600 text-white'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                        }`}
                                      >
                                        <Wrench className="w-3 h-3" />
                                        <span>صيانة هذا البلاغ</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedTicketId(tck.id);
                                          setPortalMode('PART_REQUEST');
                                          setTechActionTab('PART_REQUEST');
                                        }}
                                        className="px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/30"
                                      >
                                        <Package className="w-3 h-3" />
                                        <span>طلب قطعة غيار للبلاغ</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            <label className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedTicketId === 'ALL_OR_NEW'
                                ? 'bg-slate-800 border-slate-600'
                                : 'bg-slate-900/60 border-slate-800'
                            }`}>
                              <input
                                type="radio"
                                name="selectedTicket"
                                checked={selectedTicketId === 'ALL_OR_NEW'}
                                onChange={() => setSelectedTicketId('ALL_OR_NEW')}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <span className="text-xs text-slate-300 font-medium">
                                فتح تذكرة صيانة جديدة / صيانة وقائية شاملة للماكينة
                              </span>
                            </label>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                            <span>لا توجد بلاغات أعطال مفتوحة على هذه الماكينة حالياً. يمكنك تسجيل صيانة وقائية أو طلب قطع غيار مباشرة.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* STEP 3: Action Type Toggle (Maintenance Action vs Spare Part Requisition) */}
                <section className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <label className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span>٣. حدد الإجراء الفني المطلوب تنفيذه *</span>
                    </label>
                    
                    <div className="inline-flex p-1 rounded-lg bg-slate-950 border border-slate-800 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setTechActionTab('MAINTENANCE')}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          techActionTab === 'MAINTENANCE'
                            ? 'bg-amber-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Wrench className="w-4 h-4" />
                        <span>تسجيل إجراء صيانة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTechActionTab('PART_REQUEST')}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          techActionTab === 'PART_REQUEST'
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Package className="w-4 h-4" />
                        <span>طلب قطعة غيار للمستودع</span>
                      </button>
                    </div>
                  </div>

                  {/* TAB A: Maintenance Action Form */}
                  {techActionTab === 'MAINTENANCE' && (
                    <div className="space-y-4 animate-fade-in">
                      {/* Presets Grid */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300 block">
                          اختر نوع الإجراء المنفذ (أو اختر من النماذج السريعة):
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {maintenanceActionPresets.map((preset, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setActionTypeTitle(preset.title);
                                setActionDescription(preset.defaultDesc);
                              }}
                              className={`p-2.5 rounded-lg text-right text-xs transition-all border cursor-pointer ${
                                actionTypeTitle === preset.title
                                  ? 'bg-amber-600/20 border-amber-500 text-slate-100 ring-1 ring-amber-500/40'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold">{preset.title}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Title Input */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          عنوان الإجراء الفني *
                        </label>
                        <input
                          type="text"
                          required
                          value={actionTypeTitle}
                          onChange={e => setActionTypeTitle(e.target.value)}
                          placeholder="مثال: فحص وتغيير لوحة المفاتيح واختبار التبريد"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Description / Work Performed */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          تفاصيل وملاحظات العمل المنجز في الموقع *
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={actionDescription}
                          onChange={e => setActionDescription(e.target.value)}
                          placeholder="صف ما قمت به بالتفصيل (مثل: تم فتح الماكينة وفحص التوصيلات، تشحيم المحرك الحلزوني، والتأكد من انسيابية خروج المنتجات بنجاح)..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none shadow-inner"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Root cause */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300 block">
                            السبب الجذري للعطل (Root Cause)
                          </label>
                          <input
                            type="text"
                            value={actionRootCause}
                            onChange={e => setActionRootCause(e.target.value)}
                            placeholder="مثال: تراكم أتربة / انقطاع تيار لحظي"
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Duration */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300 block">
                            مدة العمل الميداني (بالدقائق)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="600"
                            value={durationMinutes}
                            onChange={e => setDurationMinutes(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      {/* Status After Action */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          حالة البلاغ والماكينة بعد هذا التدخل:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewTicketStatus('RESOLVED')}
                            className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                              newTicketStatus === 'RESOLVED'
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-1 ring-emerald-400/50'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4 mx-auto mb-1" />
                            <span>تم الإصلاح بنجاح (جاهزة للعمل)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setNewTicketStatus('IN_PROGRESS')}
                            className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                              newTicketStatus === 'IN_PROGRESS'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-1 ring-blue-400/50'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <Clock className="w-4 h-4 mx-auto mb-1" />
                            <span>قيد العمل والمتابعة الميدانية</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setNewTicketStatus('WAITING_FOR_PART')}
                            className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                              newTicketStatus === 'WAITING_FOR_PART'
                                ? 'bg-amber-600 text-white border-amber-500 shadow-md ring-1 ring-amber-400/50'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <Package className="w-4 h-4 mx-auto mb-1" />
                            <span>بانتظار توفير قطعة غيار</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB B: Spare Part Requisition Form */}
                  {techActionTab === 'PART_REQUEST' && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-300 flex items-start gap-2">
                        <Package className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>طلب قطعة غيار فوري عبر كود الـ QR:</strong>
                          <p className="text-[11px] text-blue-200/80 mt-0.5 leading-relaxed">
                            سيتم إرسال هذا الطلب مباشرة لقسم المخازن والمشتريات وتوثيقه وربطه بهذه الماكينة، مع تحديث حالة البلاغ تلقائياً إلى (بانتظار قطعة غيار).
                          </p>
                        </div>
                      </div>

                      {/* Custom Part Toggle */}
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                        <span className="text-slate-300 font-medium">نوع قطعة الغيار المطلوبة:</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="partMode"
                              checked={!isCustomPart}
                              onChange={() => setIsCustomPart(false)}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-200 font-bold">من الكتالوج والمستودع</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="partMode"
                              checked={isCustomPart}
                              onChange={() => setIsCustomPart(true)}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-amber-400 font-bold">قطعة مخصصة / غير مدرجة</span>
                          </label>
                        </div>
                      </div>

                      {!isCustomPart ? (
                        <>
                          {/* Part Search and Selector */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-300 block">
                                اختر قطعة الغيار المطلوبة من المخزن *
                              </label>
                              <div className="relative w-48">
                                <input
                                  type="text"
                                  value={partSearchQuery}
                                  onChange={e => setPartSearchQuery(e.target.value)}
                                  placeholder="بحث سريع بالاسم..."
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>

                            {(() => {
                              const list = (availableSpareParts.length > 0 ? availableSpareParts : defaultCatalogParts).filter(p => {
                                if (!partSearchQuery.trim()) return true;
                                const q = partSearchQuery.toLowerCase();
                                const catName = getPartCategoryName(p).toLowerCase();
                                return (p.name && p.name.toLowerCase().includes(q)) ||
                                       (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
                                       catName.includes(q);
                              });

                              return (
                                <select
                                  value={selectedPartId}
                                  onChange={e => setSelectedPartId(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                                >
                                  {list.map((p: any) => {
                                    const isAvailable = (p.currentStock || 0) > 0;
                                    const catLabel = getPartCategoryName(p);
                                    return (
                                      <option key={p.id} value={p.id}>
                                        {p.name} ({p.partNumber}) - [{catLabel}] {isAvailable ? `• متوفر بالمستودع (${p.currentStock} قطعة)` : '• غير متوفر (يتطلب شراء)'}
                                      </option>
                                    );
                                  })}
                                </select>
                              );
                            })()}
                          </div>

                          {/* Selected Part Stock Badge */}
                          {(() => {
                            const list = availableSpareParts.length > 0 ? availableSpareParts : defaultCatalogParts;
                            const cur = list.find(p => p.id === selectedPartId) || list[0];
                            if (!cur) return null;
                            const inStock = (cur.currentStock || 0) > 0;
                            return (
                              <div className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                                inStock ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4" />
                                  <span>رصيد المستودع الحالي: <strong>{cur.currentStock || 0} وحدة</strong></span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-900">
                                  {inStock ? 'جاهز للصرف المباشر للفني' : 'سيتم إصدار أمر شراء خارجي'}
                                </span>
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-amber-500/30">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-amber-300 block">
                              اسم أو وصف قطعة الغيار المطلوبة *
                            </label>
                            <input
                              type="text"
                              required
                              value={customPartName}
                              onChange={e => setCustomPartName(e.target.value)}
                              placeholder="مثال: ذراع ميكانيكي مخصص لدرج الشوكولاتة"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-300 block">
                              رقم الموديل / البارت نمبر (إن وجد)
                            </label>
                            <input
                              type="text"
                              value={customPartNumber}
                              onChange={e => setCustomPartNumber(e.target.value)}
                              placeholder="مثال: PART-XYZ-99"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Quantity with Stepper Buttons */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300 block">
                            الكمية المطلوبة *
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPartQuantity(prev => Math.max(1, prev - 1))}
                              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-base cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={partQuantity}
                              onChange={e => setPartQuantity(Math.max(1, Number(e.target.value)))}
                              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono text-center font-bold focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setPartQuantity(prev => prev + 1)}
                              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-base cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Priority */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300 block">
                            درجة الأهمية والاستعجال *
                          </label>
                          <select
                            value={partPriority}
                            onChange={e => setPartPriority(e.target.value as TicketPriority)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                          >
                            <option value="CRITICAL">حرجة جداً - الماكينة متوقفة تماماً (CRITICAL)</option>
                            <option value="HIGH">عالية - تؤثر على الدفع أو المبيعات (HIGH)</option>
                            <option value="MEDIUM">متوسطة - صيانة وقائية معتادة (MEDIUM)</option>
                            <option value="LOW">منخفضة - قطع إضافية أو استهلاكية (LOW)</option>
                          </select>
                        </div>
                      </div>

                      {/* Reason & Notes */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          سبب الاحتياج وملاحظات العطل الفني
                        </label>
                        <textarea
                          rows={2}
                          value={partReason}
                          onChange={e => setPartReason(e.target.value)}
                          placeholder="مثال: تلف محرك السحب رقم 3، لا يدور الحلزون ويجب استبداله لتشغيل الدرج..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none shadow-inner"
                        />
                      </div>
                    </div>
                  )}
                </section>

                {/* Validation Warnings if any field is missing */}
                {(!publicMachine || !techIdentity.fullName.trim() || !techIdentity.employeeCode.trim()) && (
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      {!techIdentity.employeeCode.trim() || !techIdentity.fullName.trim()
                        ? 'يرجى إدخال رمز واسم الفني في الخطوة ١ لتفعيل الإرسال.'
                        : 'يرجى تحديد رقم الماكينة في الخطوة ٢ للمتابعة.'}
                    </span>
                  </div>
                )}

                {/* Submit Technician Button */}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    icon={CheckCircle2}
                    isLoading={isSubmitting}
                    disabled={!publicMachine || !techIdentity.fullName.trim() || !techIdentity.employeeCode.trim()}
                    onClick={handleTechnicianSubmit}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
                  >
                    {techActionTab === 'MAINTENANCE'
                      ? 'توثيق إجراء الصيانة وإرساله لقاعدة البيانات'
                      : 'إرسال طلب قطعة الغيار إلى المستودع وقاعدة البيانات'}
                  </Button>
                </div>

                {/* Verification Notice */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>يتم تسجيل هذا الإجراء في سجل التدقيق الرسمي للمنظومة باسم الفني وختم التوقيت الفعلي.</span>
                  </div>
                  <span className="font-mono text-slate-500">QR Dispatch Engine v2.6</span>
                </div>
              </main>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* MODE 3: DEDICATED SPARE PARTS REQUISITION PORTAL         */}
        {/* ======================================================== */}
        {portalMode === 'PART_REQUEST' && (
          <>
            {techSubmittedResult ? (
              <main className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl text-right animate-fade-in">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/40 shadow-xl shadow-indigo-500/10">
                    <Package className="w-9 h-9" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-100">
                    تم إرسال طلب قطعة الغيار بنجاح إلى إدارة المستودع
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
                    تم إصدار أمر طلب قطعة الغيار وربطه بالماكينة وتحديث حالة التذكرة إلى (بانتظار قطعة غيار) فورياً.
                  </p>
                </div>

                {/* Summary Card */}
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-800 text-center sm:text-right">
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-0.5">رقم طلب قطعة الغيار</span>
                      <span className="text-xl font-mono font-black text-indigo-400 tracking-wider">
                        {techSubmittedResult.partRequestNumber || 'REQ-2026-CONFIRMED'}
                      </span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold text-xs">
                      الحالة: بانتظار الصرف من المستودع
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">الفني الطالب:</span>
                      <span className="text-slate-100 font-bold block text-sm text-indigo-400">
                        {techSubmittedResult.technicianName} ({techSubmittedResult.employeeCode})
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">الماكينة المستهدفة:</span>
                      <span className="text-slate-100 font-mono font-bold block text-sm text-emerald-400">
                        #{techSubmittedResult.machineNumber}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">رقم التذكرة المرتبطة:</span>
                      <span className="text-slate-200 font-mono font-bold block">
                        {techSubmittedResult.ticketNumber}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 text-[11px] block">وقت وتاريخ الطلب:</span>
                      <span className="text-slate-300 font-mono block" dir="ltr">
                        {new Date(techSubmittedResult.timestamp).toLocaleString('ar-SA')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    icon={RotateCcw}
                    onClick={() => {
                      setTechSubmittedResult(null);
                      setPartReason('');
                      setPartNotes('');
                      setCustomPartName('');
                      setCustomPartNumber('');
                      setIsCustomPart(false);
                      setMachineIdentifier('');
                      setPublicMachine(null);
                      setOpenTicketsOnMachine([]);
                    }}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    تقديم طلب قطعة غيار لماكينة أخرى
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    icon={FileText}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.print();
                      }
                    }}
                    className="w-full sm:w-auto border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    طباعة إيصال طلب الصرف
                  </Button>
                </div>
              </main>
            ) : (
              <main className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 text-right">
                
                {/* Banner */}
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-3">
                  <Package className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-indigo-100 block text-sm">بوابة طلب قطع الغيار الميدانية للمستودع:</strong>
                    <p className="text-[11px] text-indigo-300/90 mt-0.5 leading-relaxed">
                      يتم إرسال هذا الطلب مباشرة لقسم المخازن والمشتريات وتوثيقه وربطه بهذه الماكينة، مع تحديث حالة البلاغ تلقائياً إلى (بانتظار قطعة غيار).
                    </p>
                  </div>
                </div>

                {/* STEP 1: Technician Identity Verification - STRICT MANUAL ENTRY */}
                <section className="p-4 sm:p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-sm font-bold text-indigo-400">
                      <ShieldCheck className="w-5 h-5 text-indigo-400" />
                      <span>١. توثيق واعتماد الفني الطالب (إدخال الرمز السري يدوياً) *</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetTechIdentity}
                        className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>مسح الحقول</span>
                      </button>
                      {gpsVerified ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <Check className="w-3.5 h-3.5" />
                          <span>تم التحقق من الموقع</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleVerifyGps}
                          disabled={isGettingGps}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{isGettingGps ? 'جاري التحقق...' : 'تأكيد GPS'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-300/90 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>للحفاظ على السرية وضمان الموثوقية، يرجى كتابة الرمز الوظيفي الخاص بك مباشرة يدوياً.</span>
                  </div>

                  {/* Manual Fields: Code, Name, Phone */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                          <span>الرمز الوظيفي السري للفني *</span>
                        </label>
                        {techCodeVerified ? (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            رمز معتمد ومربوط بقاعدة البيانات ✓
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            أدخل الرمز ثم اضغط تحقق
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            required
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={techIdentity.employeeCode}
                            onChange={e => handleEmployeeCodeChange(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleVerifyCodeManually();
                              }
                            }}
                            placeholder="أدخل رمز الفني الوظيفي (مثال: TECH-1042 أو EMP-001)"
                            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 font-mono font-bold focus:outline-none shadow-inner"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleVerifyCodeManually}
                          className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>تحقق من الرمز</span>
                        </button>
                      </div>
                    </div>

                    {techCodeVerified && techIdentity.fullName && (
                      <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>الفني المعتمد: <strong>{techIdentity.fullName}</strong> ({techIdentity.specialization})</span>
                        </div>
                        <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-emerald-400 font-mono font-bold">
                          مُوثق
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          اسم الفني الرباعي *
                        </label>
                        <input
                          type="text"
                          required
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={techIdentity.fullName}
                          onChange={e => setTechIdentity(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="الاسم الكامل للفني..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          رقم جوال الفني
                        </label>
                        <input
                          type="tel"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={techIdentity.phone}
                          onChange={e => setTechIdentity(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="05XXXXXXXX"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* STEP 2: Target Machine & Linked Ticket */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-indigo-400" />
                      <span>٢. الماكينة المستهدفة والبلاغ المرتبط بطلب القطعة *</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={machineIdentifier}
                        onChange={e => setMachineIdentifier(e.target.value)}
                        placeholder="امسح الـ QR أو أدخل رقم الماكينة (مثال: 101 أو VM-B01-F01-01)"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-indigo-500 shadow-inner"
                      />
                    </div>

                    {allMachines.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 shrink-0">أو اختر من الأسطول:</span>
                        <select
                          value={publicMachine ? (publicMachine.machineNumber || '') : ''}
                          onChange={e => setMachineIdentifier(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- قائمة جميع ماكينات الأسطول --</option>
                          {allMachines.map(m => (
                            <option key={m.id} value={m.machineNumber}>
                              #{m.machineNumber} - {m.currentLocation?.building?.name || m.currentLocation?.areaZone || 'Site'} ({m.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {isSearching ? (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>جاري جلب ملف الماكينة وتاريخ البلاغات...</span>
                    </div>
                  ) : publicMachine ? (
                    <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 text-xs space-y-3 shadow-inner">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-indigo-600/30 border border-indigo-500/50 rounded-lg font-bold font-mono text-sm text-indigo-300">
                            ماكينة رقم: {publicMachine.machineNumber}
                          </span>
                          <span className="text-slate-300 font-medium">{publicMachine.machineType}</span>
                        </div>
                        <StatusBadge type="machine" status={publicMachine.status} />
                      </div>

                      <div className="flex items-start gap-1.5 text-slate-300 text-xs">
                        <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span><strong>الموقع الدقيق:</strong> {publicMachine.locationDescription || publicMachine.buildingName}</span>
                      </div>

                      {/* Active Tickets for this machine */}
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5">
                            <BadgeAlert className="w-4 h-4 text-rose-400" />
                            <span>اختر البلاغ المراد طلب القطعة لأجله ({openTicketsOnMachine.length}):</span>
                          </span>
                        </div>

                        {openTicketsOnMachine.length > 0 ? (
                          <div className="space-y-2">
                            {openTicketsOnMachine.map((tck: any) => {
                              const isSelected = selectedTicketId === tck.id || selectedTicketId === tck.ticketNumber;
                              return (
                                <label
                                  key={tck.id}
                                  className={`block p-3 rounded-lg border transition-all space-y-1.5 cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-950/40 border-indigo-500/70 ring-1 ring-indigo-500/50'
                                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name="selectedTicketForPart"
                                        checked={isSelected}
                                        onChange={() => setSelectedTicketId(tck.id)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="font-mono font-bold text-indigo-300 text-xs">{tck.ticketNumber}</span>
                                      <StatusBadge type="ticket" status={tck.status} />
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">{formatDate(tck.createdAt)}</span>
                                  </div>

                                  <p className="text-xs text-slate-200 font-medium leading-relaxed pr-6">
                                    {tck.description || tck.title}
                                  </p>
                                </label>
                              );
                            })}
                            
                            <label className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedTicketId === 'ALL_OR_NEW'
                                ? 'bg-slate-800 border-slate-600'
                                : 'bg-slate-900/60 border-slate-800'
                            }`}>
                              <input
                                type="radio"
                                name="selectedTicketForPart"
                                checked={selectedTicketId === 'ALL_OR_NEW'}
                                onChange={() => setSelectedTicketId('ALL_OR_NEW')}
                                className="text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-xs text-slate-300 font-medium">
                                طلب قطعة غيار كصيانة وقائية / بدون ربط ببلاغ مفتوح
                              </span>
                            </label>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                            <span>لا توجد بلاغات مفتوحة. سيتم فتح تذكرة طلب قطعة وصيانة وقائية تلقائياً.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* STEP 3: Spare Part Selection & Inventory */}
                <section className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <label className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-indigo-400" />
                      <span>٣. اختيار قطعة الغيار وتفاصيل الصرف *</span>
                    </label>
                  </div>

                  {/* Custom Part Toggle */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                    <span className="text-slate-300 font-medium">نوع قطعة الغيار المطلوبة:</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="partModeDedicated"
                          checked={!isCustomPart}
                          onChange={() => setIsCustomPart(false)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-slate-200 font-bold">من الكتالوج والمستودع</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="partModeDedicated"
                          checked={isCustomPart}
                          onChange={() => setIsCustomPart(true)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-amber-400 font-bold">قطعة مخصصة / غير مدرجة</span>
                      </label>
                    </div>
                  </div>

                  {!isCustomPart ? (
                    <>
                      {/* Part Search and Selector */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300 block">
                            اختر قطعة الغيار المطلوبة من المخزن *
                          </label>
                          <div className="relative w-48">
                            <input
                              type="text"
                              value={partSearchQuery}
                              onChange={e => setPartSearchQuery(e.target.value)}
                              placeholder="بحث سريع بالاسم..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {(() => {
                          const list = (availableSpareParts.length > 0 ? availableSpareParts : defaultCatalogParts).filter(p => {
                            if (!partSearchQuery.trim()) return true;
                            const q = partSearchQuery.toLowerCase();
                            const catName = getPartCategoryName(p).toLowerCase();
                            return (p.name && p.name.toLowerCase().includes(q)) ||
                                   (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
                                   catName.includes(q);
                          });

                          return (
                            <select
                              value={selectedPartId}
                              onChange={e => setSelectedPartId(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                            >
                              {list.map((p: any) => {
                                const isAvailable = (p.currentStock || 0) > 0;
                                const catLabel = getPartCategoryName(p);
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.partNumber}) - [{catLabel}] {isAvailable ? `• متوفر بالمستودع (${p.currentStock} قطعة)` : '• غير متوفر (يتطلب شراء)'}
                                  </option>
                                );
                              })}
                            </select>
                          );
                        })()}
                      </div>

                      {/* Selected Part Stock Badge */}
                      {(() => {
                        const list = availableSpareParts.length > 0 ? availableSpareParts : defaultCatalogParts;
                        const cur = list.find(p => p.id === selectedPartId) || list[0];
                        if (!cur) return null;
                        const inStock = (cur.currentStock || 0) > 0;
                        return (
                          <div className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                            inStock ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                          }`}>
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              <span>رصيد المستودع الحالي: <strong>{cur.currentStock || 0} وحدة</strong></span>
                            </div>
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-900">
                              {inStock ? 'جاهز للصرف المباشر للفني' : 'سيتم إصدار أمر شراء خارجي'}
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    /* Custom Part Fields */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-amber-500/30">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-xs font-semibold text-slate-300 block">
                          اسم ووصف قطعة الغيار غير المدرجة *
                        </label>
                        <input
                          type="text"
                          required
                          value={customPartName}
                          onChange={e => setCustomPartName(e.target.value)}
                          placeholder="مثال: لوحة تحكم تبريد مخصصة موديل Danfoss 2026"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          الرقم التسلسلي / كود المصنع (إن وجد)
                        </label>
                        <input
                          type="text"
                          value={customPartNumber}
                          onChange={e => setCustomPartNumber(e.target.value)}
                          placeholder="مثال: PART-SN-99418"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 block">
                          التصنيف الفني
                        </label>
                        <select
                          value={customPartCategory}
                          onChange={e => setCustomPartCategory(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="ELECTRONICS">إلكترونيات وحساسات</option>
                          <option value="MECHANICAL">ميكانيكا ومحركات سحب</option>
                          <option value="PAYMENT">أنظمة الدفع والعملات</option>
                          <option value="COOLING">نظام التبريد والحرارة</option>
                          <option value="STRUCTURAL">هيكل خارجي وإضاءة</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Quantity & Priority */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Quantity Stepper */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300 block">
                        الكمية المطلوبة للصيانة *
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPartQuantity(prev => Math.max(1, prev - 1))}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-base cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={partQuantity}
                          onChange={e => setPartQuantity(Math.max(1, Number(e.target.value)))}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono text-center font-bold focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setPartQuantity(prev => prev + 1)}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-base cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Priority */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300 block">
                        درجة الأهمية والاستعجال *
                      </label>
                      <select
                        value={partPriority}
                        onChange={e => setPartPriority(e.target.value as TicketPriority)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="CRITICAL">حرجة جداً - الماكينة متوقفة تماماً (CRITICAL)</option>
                        <option value="HIGH">عالية - تؤثر على الدفع أو المبيعات (HIGH)</option>
                        <option value="MEDIUM">متوسطة - صيانة وقائية معتادة (MEDIUM)</option>
                        <option value="LOW">منخفضة - قطع إضافية أو استهلاكية (LOW)</option>
                      </select>
                    </div>
                  </div>

                  {/* Reason & Notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 block">
                      سبب الاحتياج وملاحظات العطل الفني
                    </label>
                    <textarea
                      rows={2}
                      value={partReason}
                      onChange={e => setPartReason(e.target.value)}
                      placeholder="مثال: تلف محرك السحب رقم 3، لا يدور الحلزون ويجب استبداله لتشغيل الدرج..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                    />
                  </div>
                </section>

                {/* Validation Warnings if any field is missing */}
                {(!publicMachine || !techIdentity.fullName.trim() || !techIdentity.employeeCode.trim()) && (
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      {!techIdentity.employeeCode.trim() || !techIdentity.fullName.trim()
                        ? 'يرجى إدخال رمز واسم الفني في الخطوة ١ لتفعيل الإرسال.'
                        : 'يرجى تحديد رقم الماكينة في الخطوة ٢ للمتابعة.'}
                    </span>
                  </div>
                )}

                {/* Submit Part Requisition Button */}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    icon={Package}
                    isLoading={isSubmitting}
                    disabled={!publicMachine || !techIdentity.fullName.trim() || !techIdentity.employeeCode.trim()}
                    onClick={handleTechnicianSubmit}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    إرسال طلب قطعة الغيار إلى المستودع وقاعدة البيانات
                  </Button>
                </div>

                {/* Verification Notice */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>يتم إصدار أمر طلب قطعة غيار رسمي وموثق بختم الفني والماكينة في سجلات المنظومة.</span>
                  </div>
                  <span className="font-mono text-slate-500">Inventory Dispatch v2.6</span>
                </div>
              </main>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 space-y-1 pt-4">
          <p>© 2026 نظام إدارة أسطول مكائن البيع الذاتي الذكية. جميع الحقوق محفوظة.</p>
          <p className="text-[11px] text-slate-600">Smart Vending Machine Fleet Management & Maintenance Dispatch</p>
        </footer>

      </div>
    </div>
  );
};
