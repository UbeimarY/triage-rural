import { NavigationIssue } from './navigation-issue';

describe('NavigationIssue', () => {
  it('flags a screen that could not be downloaded', () => {
    const issue = new NavigationIssue();
    issue.report(new TypeError('Failed to fetch dynamically imported module: /chunk-ABC.js'));
    expect(issue.missingScreen()).toBe(true);
  });

  it('ignores other navigation errors', () => {
    const issue = new NavigationIssue();
    issue.report(new Error('Cannot match any routes'));
    expect(issue.missingScreen()).toBe(false);
  });
});
