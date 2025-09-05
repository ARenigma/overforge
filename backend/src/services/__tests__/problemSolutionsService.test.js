const ProblemSolutionsService = require('../problemSolutionsService');

jest.mock('../../config/supabase', () => {
  return {
    supabase: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null })
    }
  };
});

describe('ProblemSolutionsService', () => {
  test('returns empty array when no problemId provided', async () => {
    const res = await ProblemSolutionsService.fetchActiveApproachesByProblemId(null);
    expect(res).toEqual([]);
  });

  test('returns empty array when supabase returns no data', async () => {
    const res = await ProblemSolutionsService.fetchActiveApproachesByProblemId('abc');
    expect(Array.isArray(res)).toBe(true);
  });
});


