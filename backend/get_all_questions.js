require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client using service role for full access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAllQuestions() {
  try {
    const { data: problems, error } = await supabase
      .from('master_problems')
      .select('id, title, description, category, technology');

    if (error) {
      console.error('Error fetching master problems:', error.message);
      return;
    }

    if (!problems || problems.length === 0) {
      console.log('No problems found in master_problems table.');
      return;
    }

    console.log(JSON.stringify(problems, null, 2));

  } catch (error) {
    console.error('An unexpected error occurred:', error.message);
  }
}

getAllQuestions(); 