import { describe, expect, it } from 'vitest';
import { ReportGenerator } from '../src/utils/report-generator';
import type { ReviewReport } from '../src/types/report-types';

function makeReport(): ReviewReport {
  const fileReview: ReviewReport['fileReviews'][number] = {
    file: 'calculator.py',
    codeQuality: {
      file: 'calculator.py',
      issues: [],
      overallScore: 85,
      summary: 'Looks good'
    },
    testCoverage: {
      file: 'calculator.py',
      hasTests: true,
      testFiles: ['test_calculator.py'],
      untestedPaths: [],
      coverageEstimate: 90,
      summary: 'Good coverage'
    },
    refactorings: {
      file: 'calculator.py',
      suggestions: [],
      summary: 'No changes needed'
    }
  };

  return {
    pullRequest: { owner: 'example', repo: 'demo', number: 1 },
    fileReviews: [fileReview, { ...fileReview }],
    summary: {
      totalFiles: 1,
      overallScore: 85,
      criticalIssues: 0,
      highPriorityTests: 0,
      refactoringOpportunities: 0
    },
    recommendations: [{
      priority: 'high',
      category: 'security',
      description: 'Review <script>alert("x")</script> & confirm',
      files: ['calculator.py', '<img src=x onerror=alert(1)>']
    }],
    metadata: {
      analyzedAt: '2026-10-29T10:00:00.000Z',
      duration: 100,
      agentVersions: { orchestrator: '1.0' }
    }
  };
}

describe('ReportGenerator', () => {
  const generator = new ReportGenerator();

  it('renders a duplicate file review only once in Markdown', () => {
    const markdown = generator.generateMarkdownReport(makeReport());
    expect(markdown.match(/### 📄 `calculator\.py`/g)).toHaveLength(1);
    expect(markdown).toContain('Files Reviewed** | 1');
  });

  it('escapes untrusted recommendation text in HTML output', () => {
    const html = generator.generateHTMLReport(makeReport());
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; confirm');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('generates valid JSON preserving the report structure', () => {
    const report = makeReport();
    expect(JSON.parse(generator.generateJSONReport(report))).toEqual(report);
  });
});
