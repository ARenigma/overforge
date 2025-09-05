import { type NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: sessionId } = params

    console.log(`🔍 Frontend API: Fetching problems for session ${sessionId}`)

    // Connect directly to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check interview_sessions_v2 for parameter-based sessions
    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions_v2')
      .select('*')
      .eq('session_id', sessionId)
      .single()

    if (sessionError || !session) {
      console.log(`❌ Session not found: ${sessionId}`, sessionError?.message)
      return NextResponse.json(
        { 
          success: false, 
          error: "Session not found" 
        }, 
        { status: 404 }
      )
    }

    console.log(`✅ Found parameter-based session: ${sessionId}`)

    // Fetch problems manually
    const problems = []

    if (session.core_language_problem_id) {
      const { data: coreProblem, error: coreError } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate')
        .eq('id', session.core_language_problem_id)
        .single()

      if (coreProblem && !coreError) {
        problems.push({
          id: `core-${coreProblem.id}`,
          title: coreProblem.title,
          description: coreProblem.description,
          language: session.core_language.toLowerCase(),
          category: 'core_language',
          difficulty: coreProblem.difficulty_level,
          timeEstimate: coreProblem.time_estimate
        })
        console.log(`✅ Loaded core problem: ${coreProblem.title}`)
      }
    }

    // Fetch framework problem if available
    if (session.framework_problem_id) {
      const { data: frameworkProblem, error: frameworkError } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate, framework')
        .eq('id', session.framework_problem_id)
        .single()

      if (frameworkProblem && !frameworkError) {
        problems.push({
          id: `framework-${frameworkProblem.id}`,
          title: frameworkProblem.title,
          description: frameworkProblem.description,
          language: session.core_language.toLowerCase(),
          category: 'framework',
          framework: frameworkProblem.framework,
          difficulty: frameworkProblem.difficulty_level,
          timeEstimate: frameworkProblem.time_estimate
        })
        console.log(`✅ Loaded framework problem: ${frameworkProblem.title} (${frameworkProblem.framework})`)
      }
    }

    if (session.tech_stack_problem_id) {
      const { data: techProblem, error: techError } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate')
        .eq('id', session.tech_stack_problem_id)
        .single()

      if (techProblem && !techError) {
        problems.push({
          id: `tech-${techProblem.id}`,
          title: techProblem.title,
          description: techProblem.description,
          language: session.core_language.toLowerCase(), // Use core language for coding
          category: 'tech_stack',
          difficulty: techProblem.difficulty_level,
          timeEstimate: techProblem.time_estimate
        })
        console.log(`✅ Loaded tech problem: ${techProblem.title}`)
      }
    }

    const responseData = {
      sessionId: sessionId,
      isParameterSession: true,
      sessionType: 'parameter_based',
      coreLanguage: session.core_language,
      techStack: session.tech_stack,
      framework: session.core_framework,
      seniorityLevel: session.seniority_level,
      problems: problems,
      sessionData: session
    }

    console.log(`✅ Frontend API: Successfully loaded ${problems.length} problems for session ${sessionId}`)
    
    return NextResponse.json({
      success: true,
      data: responseData
    })
  } catch (error) {
    console.error(`❌ Frontend API error for session ${params.id}:`, error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch session problems" 
      }, 
      { status: 500 }
    )
  }
} 