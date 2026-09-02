import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({
  dokployGetFresh: vi.fn(),
  dokployPost: vi.fn(),
}));
vi.mock("./projects", () => ({
  getFreshDokployProjects: vi.fn(),
}));
vi.mock("./active-instance", () => ({
  getActiveDokployConfiguration: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/storage/postgres-restore-state", () => ({
  getPostgresRestoreState: vi.fn(() => ({
    currentBackupKey: "",
    returnBackupKey: "",
  })),
  savePostgresRestoreState: vi.fn(),
}));
vi.mock("@/lib/cloudflare/r2", () => ({
  getCloudflareR2S3Credentials: vi.fn(),
  getCloudflareR2S3Endpoint: vi.fn(),
}));
vi.mock("@/lib/vps/ssh-command", () => ({ runVpsCommand: vi.fn() }));

import { dokployGetFresh, dokployPost } from "./client";
import { getFreshDokployProjects } from "./projects";
import {
  configureGarageR2VolumeBackups,
  configurePostgresR2Backup,
  configureVendureBackups,
  getGarageBackupConfiguration,
  getPostgresBackupConfiguration,
  runGarageBackupsManually,
  runPostgresBackupManually,
  runVendureBackupsManually,
} from "./vendure-backups";

const input = {
  projectId: "project-1",
  postgresId: "postgres-1",
  bucket: "backups",
  prefix: "production",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
    if (endpoint === "destination.all") {
      return [
        {
          destinationId: "r2-1",
          name: "Infra Management R2 · backups",
        },
      ];
    }
    if (endpoint.startsWith("compose.one?")) {
      return { appName: "garage-generated" };
    }
    return [];
  });
  vi.mocked(dokployPost).mockImplementation(async (endpoint) =>
    endpoint === "destination.create"
      ? { destinationId: "garage-destination-1" }
      : {},
  );
  vi.mocked(getFreshDokployProjects).mockResolvedValue([]);
});

describe("configureVendureBackups", () => {
  it("backs up PostgreSQL directly to the selected R2 folder", async () => {
    await configureVendureBackups(input);

    expect(dokployPost).toHaveBeenNthCalledWith(
      1,
      "backup.create",
      expect.objectContaining({
        destinationId: "r2-1",
        prefix: "production/postgres",
        postgresId: "postgres-1",
        schedule: "0 2 * * *",
      }),
    );
  });

  it("updates an existing standalone PostgreSQL R2 backup", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint === "destination.all") {
        return [
          {
            destinationId: "r2-1",
            name: "Infra Management R2 · backups",
          },
        ];
      }
      if (endpoint.startsWith("postgres.one?")) {
        return {
          backups: [
            {
              backupId: "postgres-backup-1",
              serviceName: null,
              metadata: {},
            },
          ],
        };
      }
      return [];
    });

    await configurePostgresR2Backup({
      postgresId: "postgres-1",
      bucket: "backups",
      prefix: "store/postgres",
      time: "01:30",
    });

    expect(dokployPost).toHaveBeenCalledWith(
      "backup.update",
      expect.objectContaining({
        backupId: "postgres-backup-1",
        destinationId: "r2-1",
        prefix: "store/postgres",
        schedule: "30 1 * * *",
      }),
    );
  });

  it("reads and runs a standalone PostgreSQL backup", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint === "destination.all") {
        return [
          {
            destinationId: "r2-1",
            name: "Infra Management R2 · backups",
          },
        ];
      }
      return {
        backups: [
          {
            backupId: "postgres-backup-1",
            destinationId: "r2-1",
            prefix: "store/postgres",
            schedule: "30 1 * * *",
          },
        ],
      };
    });

    await expect(getPostgresBackupConfiguration("postgres-1")).resolves.toEqual(
      {
        bucket: "backups",
        prefix: "store/postgres",
        time: "01:30",
        configured: true,
        recoveryPoints: [],
      },
    );
    await runPostgresBackupManually("postgres-1");
    expect(dokployPost).toHaveBeenCalledWith("backup.manualBackupPostgres", {
      backupId: "postgres-backup-1",
    });
  });

  it("shows backup files returned relative to the searched R2 folder", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint === "destination.all") {
        return [
          {
            destinationId: "r2-1",
            name: "Infra Management R2 · backups",
          },
        ];
      }
      if (endpoint.startsWith("backup.listBackupFiles?")) {
        return [
          {
            Path: "postgres-2026-08-30.sql.gz",
            Size: 1_048_576,
            ModTime: "2026-08-30T01:30:00.000Z",
          },
        ];
      }
      return {
        backups: [
          {
            backupId: "postgres-backup-1",
            destinationId: "r2-1",
            prefix: "store/postgres",
            schedule: "30 1 * * *",
          },
        ],
      };
    });

    await expect(
      getPostgresBackupConfiguration("postgres-1"),
    ).resolves.toMatchObject({
      recoveryPoints: [
        {
          key: "store/postgres/postgres-2026-08-30.sql.gz",
          size: 1_048_576,
          modifiedAt: "2026-08-30T01:30:00.000Z",
          current: true,
        },
      ],
    });
  });

  it("configures both Garage volumes with the selected bucket, folder, and time", async () => {
    await configureGarageR2VolumeBackups({
      composeId: "compose-1",
      bucket: "backups",
      prefix: "production/garage",
      time: "04:15",
    });

    expect(dokployPost).toHaveBeenNthCalledWith(
      1,
      "volumeBackups.create",
      expect.objectContaining({
        volumeName: "garage-generated_garage-meta",
        prefix: "production/garage/garage-meta",
        destinationId: "r2-1",
        cronExpression: "15 4 * * *",
        turnOff: true,
      }),
    );
    expect(dokployPost).toHaveBeenNthCalledWith(
      2,
      "volumeBackups.create",
      expect.objectContaining({
        volumeName: "garage-generated_garage-data",
        prefix: "production/garage/garage-data",
      }),
    );
  });

  it("updates existing Garage volume backup jobs without duplicating them", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint === "destination.all") {
        return [
          {
            destinationId: "r2-1",
            name: "Infra Management R2 · backups",
          },
        ];
      }
      if (endpoint.startsWith("compose.one?")) {
        return { appName: "garage-generated" };
      }
      if (endpoint.startsWith("volumeBackups.list?")) {
        return [
          {
            volumeBackupId: "meta-1",
            volumeName: "garage-generated_garage-meta",
          },
          {
            volumeBackupId: "data-1",
            volumeName: "garage-generated_garage-data",
          },
        ];
      }
      return [];
    });

    await configureGarageR2VolumeBackups({
      composeId: "compose-1",
      bucket: "backups",
      prefix: "changed/garage",
      time: "05:30",
    });

    expect(dokployPost).toHaveBeenCalledWith(
      "volumeBackups.update",
      expect.objectContaining({
        volumeBackupId: "meta-1",
        prefix: "changed/garage/garage-meta",
        cronExpression: "30 5 * * *",
      }),
    );
    expect(dokployPost).not.toHaveBeenCalledWith(
      "volumeBackups.create",
      expect.anything(),
    );
  });

  it("reads the current Garage bucket, folder, and time", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint === "destination.all") {
        return [
          {
            destinationId: "r2-1",
            name: "Infra Management R2 · backups",
          },
        ];
      }
      return [
        {
          volumeBackupId: "meta-1",
          volumeName: "garage-generated_garage-meta",
          prefix: "production/garage/garage-meta",
          cronExpression: "15 4 * * *",
          destinationId: "r2-1",
        },
      ];
    });

    await expect(getGarageBackupConfiguration("compose-1")).resolves.toEqual({
      bucket: "backups",
      prefix: "production/garage",
      time: "04:15",
      configured: true,
    });
  });

  it("runs both Garage volumes manually for a standalone Garage service", async () => {
    vi.mocked(getFreshDokployProjects).mockResolvedValue([
      {
        projectId: "project-1",
        name: "Storage",
        environments: [{ services: [] }],
      },
    ] as never);
    vi.mocked(dokployGetFresh).mockResolvedValue([
      {
        volumeBackupId: "meta-1",
        volumeName: "garage-generated_garage-meta",
      },
      {
        volumeBackupId: "data-1",
        volumeName: "garage-generated_garage-data",
      },
    ]);

    await runGarageBackupsManually({
      projectId: "project-1",
      composeId: "compose-1",
    });

    expect(dokployPost).toHaveBeenNthCalledWith(
      1,
      "volumeBackups.runManually",
      { volumeBackupId: "meta-1" },
    );
    expect(dokployPost).toHaveBeenNthCalledWith(
      2,
      "volumeBackups.runManually",
      { volumeBackupId: "data-1" },
    );
  });

  it("fails Garage configuration when the selected destination is absent", async () => {
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) =>
      endpoint.startsWith("compose.one?")
        ? { appName: "garage-generated" }
        : [],
    );

    await expect(
      configureGarageR2VolumeBackups({
        composeId: "compose-1",
        bucket: "backups",
        prefix: "garage",
        time: "03:00",
      }),
    ).rejects.toThrow("Synchronize the selected R2 bucket");
    expect(dokployPost).not.toHaveBeenCalledWith(
      "backup.create",
      expect.anything(),
    );
  });

  it("runs PostgreSQL before both Garage volume backups", async () => {
    vi.mocked(getFreshDokployProjects).mockResolvedValue([
      {
        projectId: "project-1",
        name: "Store",
        description: null,
        createdAt: "",
        env: "",
        environments: [
          {
            environmentId: "environment-1",
            name: "production",
            services: [
              {
                id: "postgres-1",
                name: "postgres",
                appName: "postgres-app",
                env: "",
                serverId: null,
                sourcePath: null,
                type: "postgres",
                status: "running",
                credentials: [],
              },
              {
                id: "compose-1",
                name: "Garage with UI",
                appName: "garage-app",
                env: "",
                serverId: null,
                sourcePath: null,
                type: "compose",
                status: "running",
                credentials: [],
              },
            ],
          },
        ],
      },
    ]);
    vi.mocked(dokployGetFresh).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith("postgres.one?")) {
        return {
          backups: [
            {
              backupId: "backup-postgres",
              prefix: "production/postgres",
            },
          ],
        };
      }
      if (endpoint.startsWith("volumeBackups.list?")) {
        return [
          {
            volumeBackupId: "backup-meta",
            prefix: "production/garage-meta",
            volumeName: "garage-app_garage-meta",
          },
          {
            volumeBackupId: "backup-data",
            prefix: "production/garage-data",
            volumeName: "garage-app_garage-data",
          },
        ];
      }
      return [];
    });

    await expect(runVendureBackupsManually()).resolves.toBe(1);
    expect(dokployPost).toHaveBeenNthCalledWith(
      1,
      "backup.manualBackupPostgres",
      { backupId: "backup-postgres" },
    );
    expect(dokployPost).toHaveBeenNthCalledWith(
      2,
      "volumeBackups.runManually",
      { volumeBackupId: "backup-meta" },
    );
    expect(dokployPost).toHaveBeenNthCalledWith(
      3,
      "volumeBackups.runManually",
      { volumeBackupId: "backup-data" },
    );
  });
});
