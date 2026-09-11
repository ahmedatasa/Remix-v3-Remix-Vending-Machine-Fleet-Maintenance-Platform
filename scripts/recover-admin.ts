#!/usr/bin/env node
import readline from 'readline';
import { getRuntimeStoreManager } from '../src/server/runtimeStoreManager';
import { recoverSuperAdminCredential } from '../src/server/recoverAdmin';

async function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    // Mask input in terminal
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode?.(true);
    }

    process.stdout.write(query);
    let input = '';

    const onData = (charBuffer: Buffer) => {
      const char = charBuffer.toString();
      if (char === '\r' || char === '\n' || char === '\u0004') {
        if (stdin.isTTY) {
          stdin.setRawMode?.(oldRaw || false);
        }
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (char === '\u0008' || char === '\x7f') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (char === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else {
        input += char;
        process.stdout.write('*');
      }
    };

    if (stdin.isTTY) {
      stdin.on('data', onData);
    } else {
      // Non-TTY (piped)
      rl.question('', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function promptText(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function main() {
  console.log('=====================================================');
  console.log('  أداة استعادة بيانات المشرف العام - الخادم المحلي  ');
  console.log('  Local Server Administrator Recovery Tool           ');
  console.log('=====================================================\n');

  // Parse command line arguments if provided
  const args = process.argv.slice(2);
  let emailArg: string | undefined;
  let passwordArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      emailArg = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      passwordArg = args[i + 1];
      i++;
    }
  }

  const manager = getRuntimeStoreManager();
  const store = manager.getStore();
  const superAdmins = (store.users || []).filter((u: any) => u.role === 'SUPER_ADMIN');

  if (superAdmins.length === 0) {
    console.error('❌ خطأ: لا توجد حسابات برتبة المشرف العام (SUPER_ADMIN) في النظام.');
    console.error('إذا كانت هذه بيئة جديدة كلياً بدون مستخدمين، يرجى استخدام واجهة التهيئة الأولية.');
    process.exit(1);
  }

  let selectedEmail = emailArg;
  if (!selectedEmail) {
    if (superAdmins.length === 1) {
      selectedEmail = superAdmins[0].email;
      console.log(`تم العثور على حساب المشرف العام: ${selectedEmail}`);
    } else {
      console.log('الحسابات المتاحة برتبة المشرف العام:');
      superAdmins.forEach((sa: any, idx: number) => {
        console.log(`  [${idx + 1}] ${sa.email} (${sa.fullName || sa.name || 'بدون اسم'})`);
      });

      const selection = await promptText('\nاختر رقم الحساب أو أدخل البريد الإلكتروني: ');
      const num = parseInt(selection, 10);
      if (!isNaN(num) && num >= 1 && num <= superAdmins.length) {
        selectedEmail = superAdmins[num - 1].email;
      } else if (selection.includes('@')) {
        selectedEmail = selection;
      } else {
        console.error('❌ اختيار غير صالح.');
        process.exit(1);
      }
    }
  }

  let newPassword = passwordArg;
  if (!newPassword) {
    newPassword = await promptHidden('أدخل كلمة المرور الجديدة للمشرف العام (10 خانات على الأقل): ');
    const confirmPassword = await promptHidden('تأكيد كلمة المرور الجديدة: ');

    if (newPassword !== confirmPassword) {
      console.error('❌ كلمتا المرور غير متطابقتين.');
      process.exit(1);
    }
  }

  try {
    const result = await recoverSuperAdminCredential({
      email: selectedEmail,
      newPassword,
      storeManager: manager
    });

    console.log('\n✅ اكتملت عملية الاستعادة بنجاح:');
    console.log(`  - الحساب: ${result.targetUser?.email}`);
    console.log(`  - الرتبة: ${result.targetUser?.role}`);
    if (result.backupFile) {
      console.log(`  - نسخة احتياطية سابقة: ${result.backupFile}`);
    }
    console.log('  - تم تشفير كلمة المرور بـ bcrypt وإلغاء صلاحية الجلسات السابقة.');
    console.log('  - تم تسجيل العملية في سجل التدقيق الأمني (Audit Log).\n');
  } catch (err: any) {
    console.error(`\n❌ فشلت عملية الاستعادة: ${err.message}`);
    process.exit(1);
  }
}

// Only execute when run directly
if (process.argv[1] && (process.argv[1].endsWith('recover-admin.ts') || process.argv[1].endsWith('recover-admin.js'))) {
  main().catch((err) => {
    console.error('Fatal recovery tool error:', err);
    process.exit(1);
  });
}
