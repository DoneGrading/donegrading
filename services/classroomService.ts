import { Course, Assignment, Student } from '../types';

const CLASSROOM_BASE_URL = 'https://classroom.googleapis.com/v1';
const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';

/** Minimal shapes from Classroom REST JSON (we only map fields we use). */
type GApiCourse = { id?: string; name?: string; section?: string };
type GApiCoursesList = { courses?: GApiCourse[] };
type GApiCourseWork = {
  id?: string;
  title?: string;
  maxPoints?: number;
  description?: string;
};
type GApiCourseWorkList = { courseWork?: GApiCourseWork[] };
type GApiStudent = {
  userId?: string;
  profile?: { name?: { fullName?: string }; emailAddress?: string };
};
type GApiStudentsList = { students?: GApiStudent[] };
type GApiStudentSubmission = { id?: string; userId?: string };
type GApiSubmissionsList = { studentSubmissions?: GApiStudentSubmission[] };

export class ClassroomService {
  private accessToken: string;

  constructor(token: string) {
    this.accessToken = token;
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${CLASSROOM_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Classroom API Error';
        try {
          const error = await response.json();
          errorMessage = error.error?.message || errorMessage;
        } catch {
          errorMessage = await response.text();
        }
        throw new Error(`Classroom: ${errorMessage}`);
      }

      // Some Classroom endpoints (like DELETE) return 204 No Content.
      if (response.status === 204 || response.status === 205) {
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      // Fallback: return plain text if not JSON
      return response.text();
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        throw new Error('Network connection lost. Please check your internet.');
      }
      throw err;
    }
  }

  async getCourses(): Promise<Course[]> {
    const data = (await this.fetchWithAuth('/courses?courseStates=ACTIVE')) as GApiCoursesList;
    return (data.courses || []).map((c) => ({
      id: c.id ?? '',
      name: c.name ?? 'Course',
      period: c.section || 'General',
      source: 'google' as const,
    }));
  }

  async createCourse(name: string, period: string): Promise<Course> {
    const data = await this.fetchWithAuth('/courses', {
      method: 'POST',
      body: JSON.stringify({
        name,
        section: period || 'General',
        // Let the current authenticated teacher be the owner
        ownerId: 'me',
      }),
    });
    return {
      id: data.id,
      name: data.name,
      period: data.section || 'General',
      source: 'google',
      lastUsed: Date.now(),
    };
  }

  async getAssignments(courseId: string): Promise<Assignment[]> {
    const data = (await this.fetchWithAuth(
      `/courses/${courseId}/courseWork`
    )) as GApiCourseWorkList;
    return (data.courseWork || []).map((cw) => ({
      id: cw.id ?? '',
      title: cw.title ?? 'Assignment',
      maxScore: cw.maxPoints || 100,
      rubric: cw.description || 'Grade based on assignment title.',
    }));
  }

  async getStudents(courseId: string): Promise<Student[]> {
    const data = (await this.fetchWithAuth(`/courses/${courseId}/students`)) as GApiStudentsList;
    return (data.students || []).map((s) => ({
      id: s.userId ?? '',
      name: s.profile?.name?.fullName || 'Unknown Student',
      email: s.profile?.emailAddress || undefined, // Extracted email address for Gmail API
    }));
  }

  async createAssignment(
    courseId: string,
    title: string,
    description: string,
    maxScore: number
  ): Promise<Assignment> {
    const data = await this.fetchWithAuth(`/courses/${courseId}/courseWork`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        maxPoints: maxScore,
        workType: 'ASSIGNMENT',
        state: 'PUBLISHED',
      }),
    });
    return {
      id: data.id,
      title: data.title,
      maxScore: data.maxPoints || 100,
      rubric: data.description || '',
    };
  }

  async updateCourse(courseId: string, name: string, period?: string): Promise<Course> {
    const data = await this.fetchWithAuth(`/courses/${courseId}?updateMask=name,section`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        section: period || 'General',
      }),
    });
    return {
      id: data.id,
      name: data.name,
      period: data.section || 'General',
      source: 'google',
      lastUsed: Date.now(),
    };
  }

  async deleteCourse(courseId: string): Promise<void> {
    await this.fetchWithAuth(`/courses/${courseId}`, {
      method: 'DELETE',
    });
  }

  async updateAssignment(
    courseId: string,
    assignmentId: string,
    title: string
  ): Promise<Assignment> {
    const data = await this.fetchWithAuth(
      `/courses/${courseId}/courseWork/${assignmentId}?updateMask=title`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }
    );
    return {
      id: data.id,
      title: data.title,
      maxScore: data.maxPoints || 100,
      rubric: data.description || '',
    };
  }

  async deleteAssignment(courseId: string, assignmentId: string): Promise<void> {
    await this.fetchWithAuth(`/courses/${courseId}/courseWork/${assignmentId}`, {
      method: 'DELETE',
    });
  }

  async postGrade(
    courseId: string,
    courseWorkId: string,
    studentId: string,
    score: number,
    feedback: string
  ) {
    console.log(
      `DEBUG: Target Course: ${courseId}, Assignment: ${courseWorkId}, Student: ${studentId}`
    );

    // 1. Fetch ONLY this specific student's submission
    const submissionsData = (await this.fetchWithAuth(
      `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=${studentId}`
    )) as GApiSubmissionsList;

    const submissions = submissionsData.studentSubmissions || [];

    // 2. Find the submission object
    const submission = submissions.find((s) => String(s.userId) === String(studentId));

    if (!submission) {
      throw new Error(
        `Grade sync failed: No submission found. The student must at least open the assignment once in Google Classroom.`
      );
    }

    // 3. Patch BOTH draft and assigned grades
    const numericScore = Number(score);

    await this.fetchWithAuth(
      `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submission.id}?updateMask=draftGrade,assignedGrade`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          draftGrade: numericScore,
          assignedGrade: numericScore,
        }),
      }
    );

    // 4. Add private comment for feedback (Kept here to act as a fallback/log if Google ever enables this via API)
    if (feedback && feedback.trim()) {
      try {
        await this.fetchWithAuth(
          `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submission.id}/comments`,
          {
            method: 'POST',
            body: JSON.stringify({ text: feedback }),
          }
        );
      } catch (e) {
        console.warn('Grade posted successfully, but feedback comment failed:', e);
      }
    }

    return true;
  }

  async sendGradeEmail(
    toEmail: string,
    subject: string,
    body: string,
    imageBase64?: string | string[]
  ): Promise<void> {
    if (!toEmail) return;

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const textBody = body ?? '';
    const safeText = escapeHtml(textBody);
    const htmlBody = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject || 'DoneGrading')}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;">
    <div style="max-width:640px;margin:0 auto;padding:20px 14px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
        <div style="padding:2px 2px 12px 2px;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;">
            DoneGrading feedback
          </div>
        </div>
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:16px 16px;box-shadow:0 8px 20px rgba(15,23,42,0.06);">
          <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;font-weight:500;">
            ${safeText}
          </div>
        </div>
        <div style="padding:12px 4px 0 4px;font-size:12px;color:#64748b;">
          Sent from DoneGrading
        </div>
      </div>
    </div>
  </body>
</html>`;

    const mixedBoundary = 'DONEGRADING-MIXED-BOUNDARY';
    const altBoundary = 'DONEGRADING-ALT-BOUNDARY';

    let mimeBody: string;
    const images = Array.isArray(imageBase64) ? imageBase64 : imageBase64 ? [imageBase64] : [];
    if (images.length > 0) {
      mimeBody = `MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${mixedBoundary}"

--${mixedBoundary}
Content-Type: multipart/alternative; boundary="${altBoundary}"

--${altBoundary}
Content-Type: text/plain; charset="UTF-8"

${textBody}

--${altBoundary}
Content-Type: text/html; charset="UTF-8"

${htmlBody}

--${altBoundary}--
${images
  .slice(0, 10)
  .map(
    (img, idx) =>
      `
--${mixedBoundary}
Content-Type: image/jpeg
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="work-${idx + 1}.jpg"

${img}
`
  )
  .join('')}
--${mixedBoundary}--
`;
    } else {
      mimeBody = `MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${altBoundary}"

--${altBoundary}
Content-Type: text/plain; charset="UTF-8"

${textBody}

--${altBoundary}
Content-Type: text/html; charset="UTF-8"

${htmlBody}

--${altBoundary}--`;
    }

    const fullMessage = `To: ${toEmail}
Subject: ${subject}
${mimeBody}`;

    const base64Encoded = btoa(unescape(encodeURIComponent(fullMessage)));
    const raw = base64Encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const response = await fetch(`${GMAIL_BASE_URL}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      let errorMessage = 'Gmail API error';
      try {
        const err = await response.json();
        errorMessage = err.error?.message || errorMessage;
      } catch {
        errorMessage = (await response.text()) || errorMessage;
      }
      throw new Error(`Email failed: ${errorMessage}`);
    }
  }

  /**
   * Send a formatted lesson plan (HTML + plain-text alternative) via Gmail API.
   * `fullHtmlDocument` must be a complete HTML document (caller escapes user content).
   */
  async sendLessonPlanEmail(
    toEmail: string,
    subject: string,
    plainText: string,
    fullHtmlDocument: string
  ): Promise<void> {
    if (!toEmail) return;

    const textBody = plainText ?? '';
    const altBoundary = 'DONEGRADING-PLAN-ALT';

    const mimeBody = `MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${altBoundary}"

--${altBoundary}
Content-Type: text/plain; charset="UTF-8"

${textBody}

--${altBoundary}
Content-Type: text/html; charset="UTF-8"

${fullHtmlDocument}

--${altBoundary}--`;

    const fullMessage = `To: ${toEmail}
Subject: ${subject}
${mimeBody}`;

    const base64Encoded = btoa(unescape(encodeURIComponent(fullMessage)));
    const raw = base64Encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const response = await fetch(`${GMAIL_BASE_URL}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      let errorMessage = 'Gmail API error';
      try {
        const err = await response.json();
        errorMessage = err.error?.message || errorMessage;
      } catch {
        errorMessage = (await response.text()) || errorMessage;
      }
      throw new Error(`Email failed: ${errorMessage}`);
    }
  }
}
