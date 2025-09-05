function truncate(text, max = 400) {
  if (!text || typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildApproachComparisonContext(approaches, candidateCode = '', language = 'text') {
  if (!Array.isArray(approaches) || approaches.length === 0) return '';

  // Cap approaches to avoid prompt bloat: top 3 by confidence (if present)
  const sorted = [...approaches].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const limited = sorted.slice(0, 3);

  const lines = [];
  lines.push('KNOWN APPROACHES FOR THIS PROBLEM:');
  limited.forEach((a, idx) => {
    lines.push(`- Approach A${idx + 1}: ${a.title || a.approach_key || 'Untitled'}`);
    if (a.summary) lines.push(`  Summary: ${truncate(a.summary, 300)}`);
    if (a.steps && Array.isArray(a.steps)) {
      const stepPreview = a.steps.slice(0, 3).map(s => (typeof s === 'string' ? s : JSON.stringify(s))).join(' | ');
      if (stepPreview) lines.push(`  Steps: ${truncate(stepPreview, 200)}`);
    }
    const pros = Array.isArray(a.pros) ? a.pros : (a.pros && a.pros.items) ? a.pros.items : [];
    const cons = Array.isArray(a.cons) ? a.cons : (a.cons && a.cons.items) ? a.cons.items : [];
    if (pros && pros.length) lines.push(`  Pros: ${truncate(pros.join('; '), 200)}`);
    if (cons && cons.length) lines.push(`  Cons: ${truncate(cons.join('; '), 200)}`);
    if (a.time_complexity) lines.push(`  Time: ${a.time_complexity}`);
    if (a.space_complexity) lines.push(`  Space: ${a.space_complexity}`);
  });

  lines.push('INSTRUCTIONS FOR INTERVIEW DEPTH QUESTION:');
  lines.push('- Critically compare the candidate approach against alternatives (roads not taken).');
  lines.push('- Ask “why this, not that?” referencing the trade-offs in Pros/Cons.');
  lines.push('- Keep it contextual to the candidate\'s current code and the parameter\'s depth level.');
  lines.push('- Be concise but probing; avoid generic guidance.');

  if (candidateCode && candidateCode.length > 60) {
    lines.push('CANDIDATE CODE PREVIEW:');
    lines.push('```' + language);
    lines.push(truncate(candidateCode, 600));
    lines.push('```');
  }

  return lines.join('\n');
}

module.exports = { buildApproachComparisonContext };


