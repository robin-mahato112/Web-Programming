-- Additive application support for a new copy of the university schema.
-- Inspect and approve before applying. Already installed on ROBIN/StoreDB; no startup migration runs.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.EGSchemaVersion') IS NULL CREATE TABLE dbo.EGSchemaVersion(Version int NOT NULL PRIMARY KEY,AppliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
IF EXISTS(SELECT 1 FROM dbo.EGSchemaVersion WHERE Version=1)
BEGIN
  COMMIT;
  RETURN;
END;
CREATE TABLE dbo.EGCredentials(
  CredentialId int IDENTITY PRIMARY KEY,PatronId int NULL REFERENCES dbo.Patrons(UserID),
  StaffUserName nvarchar(50) NULL REFERENCES dbo.[User](UserName),Email nvarchar(255) NOT NULL,
  PasswordHash varchar(255) NULL,CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CHECK((PatronId IS NOT NULL AND StaffUserName IS NULL) OR (PatronId IS NULL AND StaffUserName IS NOT NULL))
);
CREATE UNIQUE INDEX UX_EGCredentials_Patron ON dbo.EGCredentials(PatronId) WHERE PatronId IS NOT NULL;
CREATE UNIQUE INDEX UX_EGCredentials_Staff ON dbo.EGCredentials(StaffUserName) WHERE StaffUserName IS NOT NULL;
CREATE INDEX IX_EGCredentials_Email ON dbo.EGCredentials(Email);
CREATE TABLE dbo.EGSessions(
  SessionHash char(64) PRIMARY KEY,CredentialId int NULL REFERENCES dbo.EGCredentials(CredentialId),
  CsrfToken char(64) NOT NULL,ExpiresAt datetime2 NOT NULL,CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_EGSessions_Expiry ON dbo.EGSessions(ExpiresAt);
CREATE TABLE dbo.EGOrderMetadata(
  OrderId int PRIMARY KEY REFERENCES dbo.Orders(OrderID),CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  Status varchar(16) NOT NULL CHECK(Status='approved'),TotalCents bigint NOT NULL CHECK(TotalCents>=0),
  DetailsJson nvarchar(max) NOT NULL CHECK(ISJSON(DetailsJson)=1)
);
CREATE TABLE dbo.EGOrderLines(
  OrderId int NOT NULL REFERENCES dbo.Orders(OrderID),ItemId int NOT NULL REFERENCES dbo.Stocktake(ItemId),
  ProductId int NOT NULL,SourceId int NOT NULL,Title nvarchar(255) NOT NULL,SourceName nvarchar(max) NOT NULL,
  UnitPriceCents bigint NOT NULL CHECK(UnitPriceCents>=0),Quantity int NOT NULL CHECK(Quantity>0),PRIMARY KEY(OrderId,ItemId)
);
CREATE TABLE dbo.EGCheckoutAttempts(
  AttemptId uniqueidentifier PRIMARY KEY,PatronId int NOT NULL REFERENCES dbo.Patrons(UserID),
  RequestHash char(64) NOT NULL,Status varchar(16) NOT NULL CHECK(Status IN('approved','declined','timed_out','changed')),
  ResultJson nvarchar(max) NOT NULL CHECK(ISJSON(ResultJson)=1),OrderId int NULL REFERENCES dbo.Orders(OrderID),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_EGCheckoutAttempts_Owner ON dbo.EGCheckoutAttempts(PatronId,CreatedAt);
IF COL_LENGTH('dbo.Stocktake','EGRv') IS NULL ALTER TABLE dbo.Stocktake ADD EGRv rowversion;
INSERT dbo.EGSchemaVersion(Version) VALUES(1);
COMMIT;
