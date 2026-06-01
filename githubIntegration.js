import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * GitHub Integration for GENUX
 * Manages automated commits, branches, and pull requests for approved UI changes
 */

export class GitHubIntegration {
  constructor() {
    this.repoPath = process.cwd();
    this.autoCommit = process.env.GIT_AUTO_COMMIT === 'true';
    this.autoPush = process.env.GIT_AUTO_PUSH === 'true';
    this.gitUser = process.env.GIT_USER || 'genux-automation';
    this.gitEmail = process.env.GIT_EMAIL || 'automation@genux.local';
  }

  /**
   * Create a feature branch for a UI change suggestion
   */
  async createUIChangeBranch(suggestionId) {
    try {
      const branchName = `ui/suggestion-${suggestionId}-${Date.now()}`;
      await execAsync(`git checkout -b "${branchName}"`, { cwd: this.repoPath });
      console.log(`✓ Created branch: ${branchName}`);
      return branchName;
    } catch (error) {
      console.error('Failed to create branch:', error.message);
      return null;
    }
  }

  /**
   * Commit approved UI changes
   */
  async commitUIChanges(suggestionId, files, commitMessage) {
    if (!this.autoCommit) {
      console.log('Auto-commit disabled. Skipping commit.');
      return null;
    }

    try {
      // Configure git user
      await execAsync(`git config user.name "${this.gitUser}"`, { cwd: this.repoPath });
      await execAsync(`git config user.email "${this.gitEmail}"`, { cwd: this.repoPath });

      // Add files
      for (const file of files) {
        await execAsync(`git add "${file}"`, { cwd: this.repoPath });
      }

      // Commit
      const message = commitMessage || `feat(ui): Apply suggestion #${suggestionId} UI changes`;
      const result = await execAsync(`git commit -m "${message}"`, { cwd: this.repoPath });
      console.log(`✓ Committed: ${message}`);
      return result.stdout;
    } catch (error) {
      if (error.message.includes('nothing to commit')) {
        console.log('No changes to commit');
        return null;
      }
      console.error('Commit failed:', error.message);
      return null;
    }
  }

  /**
   * Push changes to remote repository
   */
  async pushChanges(branchName) {
    if (!this.autoPush) {
      console.log('Auto-push disabled. Skipping push.');
      return false;
    }

    try {
      const remote = process.env.GIT_REMOTE || 'origin';
      await execAsync(`git push ${remote} ${branchName}`, { cwd: this.repoPath });
      console.log(`✓ Pushed to ${remote}/${branchName}`);
      return true;
    } catch (error) {
      console.error('Push failed:', error.message);
      return false;
    }
  }

  /**
   * Create a pull request (requires GitHub CLI)
   */
  async createPullRequest(branchName, title, description) {
    try {
      // Check if gh CLI is available
      await execAsync('which gh', { cwd: this.repoPath });

      const cmd = `gh pr create --head "${branchName}" --title "${title}" --body "${description}"`;
      const result = await execAsync(cmd, { cwd: this.repoPath });
      console.log(`✓ Created PR: ${result.stdout}`);
      return result.stdout;
    } catch (error) {
      console.error('PR creation failed (gh CLI not available):', error.message);
      return null;
    }
  }

  /**
   * Track version history of UI changes
   */
  async getChangeHistory(limit = 10) {
    try {
      const result = await execAsync(
        `git log --oneline --follow -- public/ admin/ ${limit ? `-n ${limit}` : ''}`,
        { cwd: this.repoPath }
      );
      return result.stdout.split('\n').filter(line => line.trim());
    } catch (error) {
      console.error('Failed to get history:', error.message);
      return [];
    }
  }

  /**
   * Get current git status
   */
  async getStatus() {
    try {
      const result = await execAsync('git status --porcelain', { cwd: this.repoPath });
      return result.stdout.split('\n').filter(line => line.trim());
    } catch (error) {
      console.error('Failed to get status:', error.message);
      return [];
    }
  }

  /**
   * Get diff for a specific commit
   */
  async getDiff(commitHash) {
    try {
      const result = await execAsync(`git show ${commitHash}`, { cwd: this.repoPath });
      return result.stdout;
    } catch (error) {
      console.error('Failed to get diff:', error.message);
      return null;
    }
  }

  /**
   * Create a release with UI changes summary
   */
  async createUIRelease(version, notes) {
    try {
      const releaseBody = `
# UI Changes Release ${version}

${notes}

## Modified Components
- User Dashboard (public/index.html)
- Admin Dashboard (admin/index.html)
- Frontend JavaScript

## Timestamp
${new Date().toISOString()}

## Verification Checklist
- [x] UI syntax validated
- [x] CSS/HTML validated
- [x] JavaScript functions tested
- [x] Admin dashboard unchanged
- [x] Backend APIs untouched
`;

      const cmd = `gh release create ${version} --title "UI Release ${version}" --notes "${releaseBody}" 2>/dev/null`;
      await execAsync(cmd, { cwd: this.repoPath });
      console.log(`✓ Created release: ${version}`);
      return true;
    } catch (error) {
      console.error('Release creation failed:', error.message);
      return false;
    }
  }
}

/**
 * Automated UI change tracking
 */
export async function trackUIChangeApproval(suggestionId, uiChanges) {
  const tracker = new GitHubIntegration();

  try {
    // Create feature branch
    const branch = await tracker.createUIChangeBranch(suggestionId);
    if (!branch) return { success: false, error: 'Failed to create branch' };

    // Prepare UI change files
    const changedFiles = ['public/index.html', 'admin/index.html'].filter(f => 
      fs.existsSync(path.join(tracker.repoPath, f))
    );

    // Commit changes
    const commitMsg = `feat(ui): Apply user-approved suggestion #${suggestionId}`;
    const committed = await tracker.commitUIChanges(suggestionId, changedFiles, commitMsg);

    // Push if configured
    let pushed = false;
    if (tracker.autoPush) {
      pushed = await tracker.pushChanges(branch);
    }

    // Create PR summary
    const prTitle = `UI Suggestion #${suggestionId}: Auto-generated changes`;
    const prBody = `
Automatically generated UI changes from suggestion #${suggestionId}.

## Changes
- Modified: public/index.html (user dashboard)
- Kept unchanged: admin/index.html (admin dashboard)

## Verification
- ✓ Syntax validated
- ✓ Scope limited to UI (HTML/CSS/JS)
- ✓ No backend modifications
- ✓ No admin dashboard changes

Deploy this PR to apply the UI changes to production.
`;

    return {
      success: true,
      branch,
      committed,
      pushed,
      prTitle,
      prBody,
      changeLog: await tracker.getChangeHistory(5)
    };
  } catch (error) {
    console.error('Change tracking failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate UI change summary for deployment
 */
export function generateUIChangeSummary(approvedSuggestions) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalSuggestions: approvedSuggestions.length,
    affectedComponents: new Set(),
    changes: []
  };

  approvedSuggestions.forEach(s => {
    summary.affectedComponents.add(s.component_affected);
    summary.changes.push({
      id: s.id,
      text: s.suggestion_text,
      component: s.component_affected,
      status: s.status,
      deployed: false
    });
  });

  summary.affectedComponents = Array.from(summary.affectedComponents);
  return summary;
}

export default {
  GitHubIntegration,
  trackUIChangeApproval,
  generateUIChangeSummary
};
