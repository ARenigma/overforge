const { supabaseServiceRole, supabaseClient } = require('./src/config/supabase');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function hidePassword(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding('utf8');
    
    process.stdout.write(question);
    stdin.setRawMode(true);
    
    let password = '';
    stdin.on('data', function(char) {
      char = char.toString();
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

async function createSupabaseAdmin() {
  console.log('🔐 OverForge Supabase Admin Creator');
  console.log('=====================================\n');
  console.log('✨ This script creates admin accounts using native Supabase Auth');
  console.log('⚠️  Admin accounts have FULL SYSTEM ACCESS');
  console.log('   - Can access candidate, interviewer, and admin dashboards');
  console.log('   - Can create and manage all sessions');
  console.log('   - Has global permissions across the system\n');

  try {
    console.log('Please provide the following information for the admin account:\n');

    const firstName = await askQuestion('First Name: ');
    const lastName = await askQuestion('Last Name: ');
    const email = await askQuestion('Email: ');
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('\n❌ Invalid email format. Please try again.');
      rl.close();
      return;
    }

    const password = await hidePassword('Password (min 6 chars): ');
    const confirmPassword = await hidePassword('Confirm Password: ');

    if (password !== confirmPassword) {
      console.log('\n❌ Passwords do not match. Please try again.');
      rl.close();
      return;
    }

    if (password.length < 6) {
      console.log('\n❌ Password must be at least 6 characters long.');
      rl.close();
      return;
    }

    console.log('\n🔄 Creating admin account...');

    // Step 1: Create user in Supabase Auth
    console.log('   1️⃣ Creating Supabase Auth account...');
    const { data: authData, error: authError } = await supabaseServiceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'admin'
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('❌ Email already registered. Please use a different email or login with existing credentials.');
      } else {
        console.log('❌ Error creating Supabase Auth user:', authError.message);
      }
      rl.close();
      return;
    }

    const userId = authData.user.id;
    console.log('   ✅ Supabase Auth account created');

    // Step 2: Create user profile in Users table
    console.log('   2️⃣ Creating user profile in Users table...');
    const username = email.split('@')[0] + '_admin_' + Date.now();
    
    const userData = {
      id: userId, // Use Supabase Auth UUID
      email,
      username,
      firstName,
      lastName,
      role: 'admin',
      isActive: true,
      organization: 'OverForge Admin',
      department: 'Administration',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const { data: userProfile, error: profileError } = await supabaseServiceRole
      .from('Users')
      .insert([userData])
      .select()
      .single();

    if (profileError) {
      console.log('❌ Error creating user profile:', profileError.message);
      
      // Clean up: Delete the auth user if profile creation fails
      await supabaseServiceRole.auth.admin.deleteUser(userId);
      console.log('   🧹 Cleaned up incomplete auth account');
      rl.close();
      return;
    }

    console.log('   ✅ User profile created');

    console.log('\n🎉 Admin account created successfully!');
    console.log('\n📋 Account Details:');
    console.log(`   Name: ${userProfile.firstName} ${userProfile.lastName}`);
    console.log(`   Username: ${userProfile.username}`);
    console.log(`   Email: ${userProfile.email}`);
    console.log(`   Role: ${userProfile.role}`);
    console.log(`   ID: ${userProfile.id}`);
    console.log(`   Organization: ${userProfile.organization}`);
    
    console.log('\n🔐 Admin Capabilities:');
    console.log('   ✅ Access to candidate dashboard (/dashboard/candidate)');
    console.log('   ✅ Access to interviewer dashboard (/dashboard/interviewer)');
    console.log('   ✅ Access to admin panel (/admin-panel)');
    console.log('   ✅ Create and manage interview sessions');
    console.log('   ✅ Global access to all sessions');
    console.log('   ✅ Full system permissions');
    
    console.log('\n🚀 Login Instructions:');
    console.log(`   1. Go to: http://localhost:3000/auth`);
    console.log(`   2. Select "Interviewer" role`);
    console.log(`   3. Click "Login"`);
    console.log(`   4. Email: ${email}`);
    console.log(`   5. Password: [Your chosen password]`);
    console.log(`   6. Will redirect to interviewer dashboard (admin can access all dashboards)`);
    
    console.log('\n🛡️ Security Notes:');
    console.log('   - Admin accounts use native Supabase authentication');
    console.log('   - Email is automatically confirmed');
    console.log('   - Admin role gives access to all system features');
    console.log('   - Store credentials securely');

  } catch (error) {
    console.error('\n💥 Unexpected error:', error.message);
    console.log('Please check your .env file and ensure Supabase keys are configured correctly.');
  } finally {
    rl.close();
  }
}

async function checkSupabaseConnection() {
  console.log('🔍 Checking Supabase connection...');
  
  try {
    // Test service role connection
    const { data, error } = await supabaseServiceRole
      .from('Users')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Supabase connection failed:', error.message);
      console.log('\nPlease check your .env file:');
      console.log('   - SUPABASE_URL should be set');
      console.log('   - SUPABASE_SERVICE_ROLE_KEY should be set');
      console.log('   - Make sure these are the service role key, not anon key');
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    console.log(`   Found ${data.length} users in database\n`);
    return true;
  } catch (error) {
    console.log('❌ Connection test failed:', error.message);
    return false;
  }
}

async function main() {
  const connected = await checkSupabaseConnection();
  if (!connected) {
    process.exit(1);
  }
  
  await createSupabaseAdmin();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Admin creation cancelled.');
  rl.close();
  process.exit(0);
});

main(); 