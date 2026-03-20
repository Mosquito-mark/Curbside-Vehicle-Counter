# Business-Led Application Development Environment (BLADE)
## Responsibility and Accountability Document

**Date:** June 2025 (Template Version) / March 2026 (Completed)
**Prepared for:** City Operations - Street Counter

---

## Executive Summary

The purpose of this Responsibility & Accountability Document is to clearly define and establish the roles, responsibilities, and accountabilities associated with the business-led application development. It serves as a statement of accepted responsibility and accountability among stakeholders, ensuring that all parties understand their obligations, thereby establishing a support model for the application which can be sustained by the business area for its ongoing operation.

---

## [City Operations - Street Counter]

### Purpose of the Document
The purpose of this Responsibility & Accountability Document is to clearly define and establish the roles, responsibilities, and accountabilities associated with the business-led application development. It serves as a statement of accepted responsibility and accountability among stakeholders, ensuring that all parties understand their obligations, thereby establishing a support model for the application which can be sustained by the business area for its ongoing operation.

### Application Information

| Application Name | Street Counter |
| :--- | :--- |
| **Department / Branch** | City Operations / Parks and Roads Services |
| **Section/Business Unit** | Traffic Operations / Curbside and Parking Management |
| **Overview of the Application** | The Street Counter application is a mobile-friendly web tool designed for field staff to efficiently record and categorize vehicle traffic. It replaces legacy manual counting methods (e.g., pen and paper or physical clickers) by allowing users to digitally log vehicle types, timestamps, and GPS coordinates. |

### Impact Profile

| Impact | Risk | Explanation |
| :--- | :--- | :--- |
| **Internal** - What’s the impact to internal users if the application is unavailable? | Low | The application is utilized by a small, specialized team (Curbside and Parking Management) consisting of fewer than 10 users. |
| **External** - What’s the impact to external users if the application is unavailable? | N/A | The application is for internal use only and has no external users. |
| **Infrastructure** - Describe the impact to other application / systems | Low | The web application operates independently and does not integrate with or feed data into any other City of Edmonton applications or databases. Its unavailability will not impact other infrastructure. |
| **Severity** - Describe the severity level and provide explanation | Low | The application is utilized exclusively by a small internal team, does not impact external users or other infrastructure, and has established manual workarounds (e.g., manual counting) in the event of an outage. |

### Integration Profile

| Integration | Direction | Frequency | Complexity | Method |
| :--- | :--- | :--- | :--- | :--- |
| **Data Export** | 1-way | Adhoc | Simple | CSV export to Google Drive |

### Incident and Support Profile (RACI Method Used for simplicity)

| Support | Responsible | Additional Information |
| :--- | :--- | :--- |
| **1st Line of Support** | Mark Hill | Acting as the initial point of contact for users experiencing issues, gathering information, working directly with users to resolve problems, and communicating service disruptions and resolution status to stakeholders. |
| **2nd Line of Support** | N/A | The 1st Line of Support is also responsible for all technical troubleshooting and resolution. There is no separate 2nd Line of Support. |
| **Escalation** | Manager, Curbside and Parking Mgt. | In the event that an issue cannot be resolved by the primary support contact, the incident will be escalated to the Manager of the Curbside and Parking Management unit for further review, prioritization, and decision-making. |
| **Incident Management** | Mark Hill | Incidents and support requests are reported directly via email to the primary support contact. There is no formal SLA; support is provided strictly on a best-effort basis. In the event of an application outage, users revert to manual counting processes as a workaround. No incident management or recovery support is expected from OCT. |
| **Service Level** | Mark Hill | There are no formally defined SLAs, RPO, or RTO. Support and recovery efforts are provided strictly on a best-effort basis. Users revert to manual counting processes as a temporary workaround. |
| **OCT Support Expectation** | N/A | No operational, maintenance, troubleshooting, or recovery support is expected from the central IT department (OCT). The Curbside and Parking Management unit assumes full and sole responsibility for the ongoing support and lifecycle management of this application. |

### Data Profile

| Data | Description |
| :--- | :--- |
| **Source** | The primary data source consists of records manually generated by application users while conducting field observations (e.g., logging vehicle counts, timestamps, and GPS coordinates). |
| **Destination** | The primary data destination is the Google Firebase database. Subsequently, the data is exported by users into a CSV file format for further analysis and long-term storage. |
| **Backup** | The primary data backup mechanism relies on the automated backup services provided by the Google Firebase platform. Additionally, users manually export the collected data to CSV files, which serve as a secondary, offline backup. |
| **Lifecycle** | Data is stored temporarily within the Google Firebase database. Upon completion of a counting session, the data is exported to a CSV file for long-term retention in the City's official Google Workspace. Following successful export, the temporary records within Firebase are deleted. |
| **Controls** | Access is strictly controlled via authentication using authorized City of Edmonton Google Workspace accounts. Database security rules are configured to ensure users can only access and view their own counting sessions. All data transmitted between the application and the database is encrypted in transit using standard HTTPS encryption. |
| **Classification** | **Public**. The application only records generic vehicle counts and locations. |
| **Personally Identifiable Information** | No public PII is collected. Employee email addresses are captured strictly for authentication purposes. |

### Security Profile

| Security | Description |
| :--- | :--- |
| **Authentication** | Authentication is handled exclusively via Google Single Sign-On (SSO) using official City of Edmonton Google Workspace accounts. |
| **Authorization** | Authorization and access provisioning are managed by the Business Owner. Within the application, Firebase Security Rules enforce access controls, ensuring that authenticated users can only read and write their own specific counting session data. |

### Development Profile

| Requirements | Description |
| :--- | :--- |
| **Requirements** | Due to the low complexity of the application, no formal requirements gathering process was required. Application requirements were discussed and documented informally within the Curbside and Parking Management team. |
| **Defects** | Software bugs, defects, and fixes are formally tracked and managed using a dedicated GitHub Repository for the web application. |
| **Enhancement & Updates** | Enhancement requests are submitted informally via email to the Business Owner and prioritized based on team needs. |
| **Documentation** | Technical documentation is maintained directly within the application's code comments. End-user documentation consists of a brief user guide hosted on a shared Google Doc, which includes a web link to a short video tutorial demonstrating the web application's functionality. |
| **Training** | Training is delivered informally through peer-to-peer shadowing and by directing users to review the shared user guide and accompanying video tutorial. |
| **Organizational Change Management** | The Business Owner serves as the primary change champion, proactively communicating application updates to the team and gathering informal feedback to address user concerns and facilitate adoption. |

### Release Management

| Consideration | Description |
| :--- | :--- |
| **Testing** | Basic unit testing is performed by the developer. User Acceptance Testing (UAT) is conducted informally by the Curbside and Parking Management team during a dedicated application review meeting prior to any production release. |
| **Environment Promotion** | There is no formal release process or separate testing environments. A single production environment is utilized, and application updates are deployed directly by the developer following informal UAT. |
| **Application Lifecycle Process** | The application's usage, relevance, and potential for replacement by an enterprise solution are reviewed annually by the Business Owner, or whenever the underlying technology platform approaches its end of life. |
| **User Deployment** | Web application accessible via browser. |
| **Release Log** | Changes, versions, and bug fixes are documented in the application's GitHub repository and within code comments. |
| **Catalog** | The application URL is made available directly to the Curbside and Parking Management team via internal communications/team sites. |

### Risk Review

| Risk | Impact | Likelihood | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Security - Unauthorized Access / Data Breach** | Low | Unlikely | Low | Mitigate: Application uses secure Google SSO and Firebase rules. Data is Public classification. |
| **Data quality issues due to lack of data governance** | Low | Possible | Low | Accept: Data is manually verified by users during export. |
| **Unstable applications due to lack of testing / version control** | Moderate | Possible | Low | Accept: Revert back to manual counting process if things break. Code is versioned in GitHub. |
| **Applications that don't scale or perform poorly** | Low | Unlikely | Low | Accept: Look for replacement when needs outgrow application. Current user base is <10. |
| **Applications that are difficult to maintain or support** | Moderate | Possible | Low | Accept: Revert back to manual process if things break. |
| **Applications that cause conflicts with core systems** | N/A | N/A | N/A | N/A: No integration with core systems. |
| **Application consuming excess computing resources** | Low | Unlikely | Low | Mitigate: Runs on serverless cloud infrastructure (Cloud Run/Firebase) which scales automatically. |
| **Developers leaving the team / organization** | Major | Possible | Medium | Accept: Revert back to manual process, or utilize GitHub repository and code comments to onboard a new developer/contractor. |
| **Lack of clear ownership / accountability for applications** | Low | Unlikely | Low | Mitigate: Use of this BLADE RaaD to establish roles & responsibilities. |

### Roles and Responsibilities

| Profile | Responsibility | Name & Title |
| :--- | :--- | :--- |
| **Application Owner** | Accountable for the application's lifecycle, support, maintenance, performance, and ensuring the application delivers and remains reliable. | Mark Hill, Methods Analyst II, Curbside and Parking Management |
| **Asset Owner** | Accountable for the digital assets and the associated risk exposure. Also accountable for the budget and its utilization. | Manager, Curbside and Parking Management |
| **Data Owner** | Accountable for data integrity, security, and quality. Sets access control and usage guidelines for compliance. | Manager, Curbside and Parking Management |
| **Developer** | Responsible for developing and maintaining the application, ensuring code quality, and adhering to security best practices. | Mark Hill |
| **1st Line Support** | Responsible for providing 1st line support, troubleshooting issues, and escalating problems to 2nd line support as needed. Communicate outage and issue resolution updates to affected areas | Mark Hill |
| **Enterprise IT** | Responsible for the delivery of COE enterprise technology infrastructure, ensuring systems are reliable, secure, and support business goals. | Financial and Corporate Services, Open City and Technology Branch |

---

### Document Review

**Submitted By:**
| Name | Title | Submit Date |
| :--- | :--- | :--- |
| Mark Hill | Methods Analyst II | |

**Reviewed By:**
| Name | Title | Review Date |
| :--- | :--- | :--- |
| | | |
| | | |

**Accepted By Application Owner:**
| Name and Title | Signature | Date |
| :--- | :--- | :--- |
| Mark Hill, Methods Analyst II | | |

### Review and Updates
This document will be reviewed and updated Annually with BLADE representatives (agreed upon check-in interval during intake meeting) or as needed to reflect changes in the system, processes, or responsibilities.

---

### Appendix
*Add technical diagrams or any reference information here. Remove this section if not needed.*

**SAMPLE DATA REPOSITORY**
Link to Folder: [Insert Link]

**SAMPLE APPLICATION BROWSER LINK**
Link to Folder: [Insert Link]

**SAMPLE TRAINING VIDEOS**
Link to Folder: [Insert Link]
