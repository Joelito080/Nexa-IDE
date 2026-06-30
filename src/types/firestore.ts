/**
 * Firestore Type Definitions for NEXA IDE
 */

export interface FirebaseUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Date;
  updatedAt: Date;
  role: 'user' | 'admin';
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  language: 'typescript' | 'javascript' | 'python' | 'other';
  framework?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  lastOpenedAt?: Date;
  isArchived: boolean;
  tags: string[];
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  lastModifiedBy: string;
  size: number;
}

export interface ProjectSettings {
  buildCommand?: string;
  runCommand?: string;
  testCommand?: string;
  outputDirectory?: string;
  environmentVariables?: Record<string, string>;
  codeQualityEnabled: boolean;
  autoFormatOnSave: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceState {
  id: string;
  activeProjectId?: string;
  openedFiles: string[];
  selectedFile?: string;
  editorLayout: 'single' | 'split' | 'grid';
  sidebarCollapsed: boolean;
  zoomLevel: number;
  theme: 'light' | 'dark' | 'auto';
  updatedAt: Date;
}

export interface UserPreferences {
  id: string;
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    lineHeight: number;
    wordWrap: boolean;
  };
  notifications: {
    emailOnError: boolean;
    emailOnCollaboration: boolean;
    desktopNotifications: boolean;
  };
  shortcuts: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedProject extends Project {
  collaborators: string[];
  permissionLevel: 'view' | 'comment' | 'edit' | 'admin';
  isPublic: boolean;
}

