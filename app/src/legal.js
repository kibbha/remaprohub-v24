export const LEGAL_REVIEW_DATE='2026-09-20';

const f=(key,section,type='text',required=false,extra={})=>({key,section,type,required,...extra});
const identity=[
  f('employerName','employer','text',true),f('employerAddress','employer','textarea',true),
  f('employerRegistration','employer'),f('employeeName','employee','text',true),
  f('employeeAddress','employee','textarea'),f('employeeId','employee')
];
const payCore=[
  ...identity,f('period','pay','text',true),f('payDate','pay','date',true),f('role','employee'),
  f('hours','pay','number',false,{min:0,step:'0.01'}),f('overtimeHours','pay','number',false,{min:0,step:'0.01'}),
  f('baseSalary','earnings','number',true,{min:0,step:'0.01'}),f('overtimePay','earnings','number',false,{min:0,step:'0.01'}),
  f('bonuses','earnings','number',false,{min:0,step:'0.01'}),f('allowances','earnings','number',false,{min:0,step:'0.01'}),
  f('tips','earnings','number',false,{min:0,step:'0.01'}),f('grossSalary','totals','number',true,{min:0,step:'0.01'}),
  f('otherDeductions','deductions','number',false,{min:0,step:'0.01'}),f('netSalary','totals','number',true,{min:0,step:'0.01'}),
  f('currency','totals','text',true),f('paymentMethod','totals'),f('payrollNotes','notes','textarea')
];
const contractCore=[
  ...identity,f('role','employment','text',true),f('workplace','employment','text',true),
  f('startDate','employment','date',true),f('endDate','employment','date'),f('contractType','employment','text',true),
  f('probation','employment'),f('weeklyHours','workingTime','number',true,{min:0,step:'0.01'}),
  f('workSchedule','workingTime','textarea'),f('grossSalary','pay','number',true,{min:0,step:'0.01'}),
  f('salaryComponents','pay','textarea'),f('payFrequency','pay'),f('overtimeTerms','workingTime','textarea'),
  f('paidLeave','leave','textarea'),f('notice','termination','textarea'),f('collectiveAgreement','employment'),
  f('pensionInsurance','benefits','textarea'),f('trainingTerms','benefits','textarea'),
  f('employerSignature','signatures'),f('employeeSignature','signatures')
];
const extraCore=[
  ...identity,f('role','employment','text',true),f('workplace','employment','text',true),f('startDate','employment','date',true),
  f('endDate','employment','date'),f('hours','workingTime','number',true,{min:0,step:'0.01'}),
  f('hourlyRate','pay','number',true,{min:0,step:'0.01'}),f('shiftDetails','workingTime','textarea'),
  f('grossSalary','pay','number',false,{min:0,step:'0.01'}),f('holidayPay','pay','number',false,{min:0,step:'0.01'}),
  f('allowances','pay','number',false,{min:0,step:'0.01'}),f('collectiveAgreement','employment'),
  f('employerSignature','signatures'),f('employeeSignature','signatures')
];
const commonHr={
  timesheet:[...identity,f('period','pay','text',true),f('hours','workingTime','number',true,{min:0,step:'0.01'}),f('overtimeHours','workingTime','number',false,{min:0,step:'0.01'}),f('absenceHours','workingTime','number',false,{min:0,step:'0.01'}),f('responsible','signatures')],
  leaveRequest:[...identity,f('startDate','leave','date',true),f('endDate','leave','date',true),f('reason','leave','textarea'),f('leaveBalance','leave','number',false,{step:'0.01'}),f('responsible','signatures')],
  employmentCertificate:[...identity,f('role','employment','text',true),f('startDate','employment','date',true),f('endDate','employment','date'),f('employmentRate','employment'),f('certificateDuties','employment','textarea'),f('certificateAssessment','employment','textarea'),f('issuePlaceDate','signatures'),f('employerSignature','signatures')],
  employmentTermination:[...identity,f('role','employment'),f('endDate','termination','date',true),f('terminationInitiator','termination'),f('reason','termination','textarea'),f('notice','termination','textarea'),f('remainingLeave','termination'),f('finalSettlement','termination'),f('returnOfProperty','termination','textarea'),f('employerSignature','signatures'),f('employeeSignature','signatures')],
  onboardingChecklist:[...identity,f('role','employment'),f('startDate','employment','date',true),f('workPermitCheck','checks'),f('taxSocialRegistration','checks'),f('insuranceRegistration','checks'),f('policyTraining','checks'),f('haccpTraining','checks'),f('equipmentIssued','checks'),f('responsible','signatures')],
  salaryChange:[...identity,f('role','employment'),f('effectiveDate','pay','date',true),f('oldSalary','pay','number',false,{min:0,step:'0.01'}),f('newSalary','pay','number',true,{min:0,step:'0.01'}),f('employmentRate','pay'),f('reason','notes','textarea'),f('employerSignature','signatures'),f('employeeSignature','signatures')],
  expenseReport:[...identity,f('period','pay'),f('expenseDate','expenses','date'),f('expenseCategory','expenses'),f('expenseDescription','expenses','textarea'),f('amount','expenses','number',true,{min:0,step:'0.01'}),f('currency','expenses'),f('receiptReference','expenses'),f('responsible','signatures')],
  trainingRecord:[...identity,f('trainingTopic','training','text',true),f('trainingProvider','training'),f('date','training','date',true),f('trainingHours','training','number',false,{min:0,step:'0.01'}),f('trainingResult','training'),f('certificateReference','training'),f('responsible','signatures')]
};

const packs={
CH:{
 name:'Suisse',source:'CO art. 323b et 330b · Centre d’information AVS/AI 2026 · OFAS · CCNT 2026',note:'AVS/AI/APG et AC sont préchargés depuis les références 2026; LPP, accident, fiscalité et paramètres propres à la caisse/assureur doivent être vérifiés pour l’établissement.',
 payslip:[...payCore,f('employeeAhvNumber','employee'),f('employerAhvNumber','employer'),f('ccntCategory','employment'),f('ccntMinimumSalary','pay','number',false,{min:0,step:'0.01'}),f('ahvSubjectSalary','deductions','number',false,{min:0,step:'0.01'}),f('acSubjectSalary','deductions','number',false,{min:0,step:'0.01'}),f('lppInsuredSalary','deductions','number',false,{min:0,step:'0.01'}),f('accidentSubjectSalary','deductions','number',false,{min:0,step:'0.01'}),f('avsAiApg','deductions','number',false,{min:0,step:'0.01'}),f('unemploymentInsurance','deductions','number',false,{min:0,step:'0.01'}),f('pensionEmployee','deductions','number',false,{min:0,step:'0.01'}),f('accidentEmployee','deductions','number',false,{min:0,step:'0.01'}),f('withholdingTax','deductions','number',false,{min:0,step:'0.01'}),f('withholdingCanton','deductions'),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'})],
 employmentContract:[...contractCore,f('functionDescription','employment','textarea'),f('salarySupplements','pay','textarea')],
 extraContract:[...extraCore,f('salarySupplements','pay','textarea')]
},
FR:{
 name:'France',source:'Code du travail · Service-Public (bulletin de paie / contrat)',note:'Les rubriques exactes dépendent de la convention collective, de la classification, des organismes et de la situation fiscale.',
 payslip:[...payCore,f('siret','employer','text',true),f('apeCode','employer'),f('collectiveAgreement','employment','text',true),f('classification','employment'),f('socialSecurityNumber','employee'),f('baseHours','pay','number',false,{min:0,step:'0.01'}),f('overtimeRate','earnings'),f('employeeContributions','deductions','number',false,{min:0,step:'0.01'}),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'}),f('taxableNet','tax','number',false,{min:0,step:'0.01'}),f('withholdingTaxRate','tax'),f('withholdingTax','tax','number',false,{min:0,step:'0.01'}),f('netSocial','totals','number',false,{min:0,step:'0.01'}),f('netBeforeTax','totals','number',false,{min:0,step:'0.01'}),f('paidLeaveBalance','leave')],
 employmentContract:[...contractCore,f('classification','employment'),f('paidLeaveBalance','leave')],
 extraContract:[...extraCore,f('classification','employment')]
},
DE:{
 name:'Allemagne',source:'Entgeltbescheinigungsverordnung §1 · Nachweisgesetz §2',note:'Les données fiscales et sociales doivent correspondre au dossier de paie et aux organismes compétents.',
 payslip:[...payCore,f('birthDate','employee','date'),f('socialInsuranceNumber','employee'),f('taxId','tax'),f('taxClass','tax'),f('childAllowance','tax'),f('churchTax','tax'),f('contributionGroup','deductions'),f('healthFund','deductions'),f('socialInsuranceDays','deductions','number',false,{min:0,step:'1'}),f('payrollTax','deductions','number',false,{min:0,step:'0.01'}),f('socialInsuranceEmployee','deductions','number',false,{min:0,step:'0.01'}),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'})],
 employmentContract:[...contractCore,f('breaks','workingTime','textarea'),f('restPeriods','workingTime','textarea'),f('shiftSystem','workingTime','textarea'),f('terminationProcedure','termination','textarea')],
 extraContract:[...extraCore,f('breaks','workingTime','textarea'),f('restPeriods','workingTime','textarea')]
},
IT:{
 name:'Italie',source:'Legge 5 gennaio 1953 n. 4 · Normattiva',note:'La busta paga doit refléter le CCNL applicable, les retenues fiscales et sociales et les éléments de rémunération réellement dus.',
 payslip:[...payCore,f('fiscalCode','employee'),f('inpsNumber','employee'),f('inailPosition','employer'),f('ccnlCode','employment','text',true),f('classification','employment'),f('inpsContribution','deductions','number',false,{min:0,step:'0.01'}),f('irpef','tax','number',false,{min:0,step:'0.01'}),f('regionalTax','tax','number',false,{min:0,step:'0.01'}),f('municipalTax','tax','number',false,{min:0,step:'0.01'}),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'}),f('employerSignature','signatures')],
 employmentContract:[...contractCore,f('ccnlCode','employment','text',true),f('classification','employment'),f('jobLevel','employment')],
 extraContract:[...extraCore,f('ccnlCode','employment','text',true),f('classification','employment'),f('jobLevel','employment')]
},
ES:{
 name:'Espagne',source:'Orden 27/12/1994 (BOE) · RD 1659/1998; RD 723/2026 à partir du 05.10.2026',note:'Au 19.09.2026, le RD 1659/1998 reste applicable jusqu’au 04.10.2026; le RD 723/2026 s’applique dès le 05.10.2026.',
 payslip:[...payCore,f('nif','employee'),f('socialSecurityNumber','employee'),f('contributionGroup','employment'),f('seniority','employment'),f('salaryAccruals','earnings','number',false,{min:0,step:'0.01'}),f('nonSalaryAccruals','earnings','number',false,{min:0,step:'0.01'}),f('socialSecurityEmployee','deductions','number',false,{min:0,step:'0.01'}),f('irpf','tax','number',false,{min:0,step:'0.01'}),f('contributionBase','employerCharges','number',false,{min:0,step:'0.01'}),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'})],
 employmentContract:[...contractCore,f('professionalGroup','employment'),f('holidayDuration','leave'),f('scheduleDistribution','workingTime','textarea')],
 extraContract:[...extraCore,f('professionalGroup','employment')]
},
PT:{
 name:'Portugal',source:'Código do Trabalho art. 276 · Diário da República / gov.pt',note:'Le reçu doit détailler rémunération, période, retenues et net; le contrat doit reprendre les informations légales applicables.',
 payslip:[...payCore,f('nif','employee'),f('niss','employee'),f('professionalCategory','employment','text',true),f('socialSecurityEmployee','deductions','number',false,{min:0,step:'0.01'}),f('irs','tax','number',false,{min:0,step:'0.01'}),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'})],
 employmentContract:[...contractCore,f('professionalCategory','employment','text',true),f('accidentInsurer','benefits'),f('accidentPolicy','benefits'),f('compensationFund','benefits')],
 extraContract:[...extraCore,f('professionalCategory','employment','text',true),f('accidentInsurer','benefits'),f('accidentPolicy','benefits')]
},
NL:{
 name:'Pays-Bas',source:'Rijksoverheid · loonstrook / arbeidsovereenkomst',note:'Le bulletin et les informations contractuelles doivent être cohérents avec le contrat, la CAO et la situation de paie.',
 payslip:[...payCore,f('minimumWage','pay','number',false,{min:0,step:'0.01'}),f('holidayAllowance','earnings','number',false,{min:0,step:'0.01'}),f('pensionEmployee','deductions','number',false,{min:0,step:'0.01'}),f('payrollTax','tax','number',false,{min:0,step:'0.01'}),f('writtenContract','employment'),f('indefiniteContract','employment'),f('onCallContract','employment'),f('employerContributions','employerCharges','number',false,{min:0,step:'0.01'})],
 employmentContract:[...contractCore,f('holidayAllowance','pay'),f('cao','employment'),f('onCallContract','employment'),f('nonCompete','employment','textarea')],
 extraContract:[...extraCore,f('holidayAllowance','pay'),f('cao','employment'),f('onCallContract','employment')]
},
GB:{
 name:'Royaume-Uni',source:'GOV.UK · Payslips / Written statement of employment particulars',note:'PAYE, National Insurance, pension et autres retenues doivent provenir des données de paie réelles.',
 payslip:[...payCore,f('niNumber','employee'),f('taxCode','tax'),f('payrollTax','deductions','number',false,{min:0,step:'0.01'}),f('nationalInsurance','deductions','number',false,{min:0,step:'0.01'}),f('pensionEmployee','deductions','number',false,{min:0,step:'0.01'}),f('studentLoan','deductions','number',false,{min:0,step:'0.01'}),f('hoursVariablePay','pay','number',false,{min:0,step:'0.01'}),f('yearToDate','totals','textarea')],
 employmentContract:[...contractCore,f('workDays','workingTime'),f('hoursVariation','workingTime','textarea'),f('sickPay','benefits'),f('otherPaidLeave','leave'),f('benefits','benefits','textarea'),f('mandatoryTraining','benefits','textarea')],
 extraContract:[...extraCore,f('workDays','workingTime'),f('hoursVariation','workingTime','textarea'),f('holidayEntitlement','leave')]
}
};

const aliases={SUISSE:'CH',SWITZERLAND:'CH',CHE:'CH',FRANCE:'FR',FRA:'FR',GERMANY:'DE',DEUTSCHLAND:'DE',DEU:'DE',ITALY:'IT',ITALIA:'IT',ITA:'IT',SPAIN:'ES','ESPAÑA':'ES',ESP:'ES',PORTUGAL:'PT',PRT:'PT',NETHERLANDS:'NL',NEDERLAND:'NL',NLD:'NL',UK:'GB','UNITED KINGDOM':'GB','GREAT BRITAIN':'GB',GBR:'GB'};
export const LEGAL_COUNTRIES=Object.entries(packs).map(([code,p])=>({code,name:p.name}));
export function legalCountryCode(value='CH'){const raw=String(value||'').trim().toUpperCase();return packs[raw]?raw:(aliases[raw]||'GENERIC')}
const generic={
 name:'International / générique',source:'Référentiel générique ReMaPro Hub',note:'Aucun pack juridique spécifique n’est disponible pour ce pays. Faire valider le document par un spécialiste local.',
 payslip:payCore,employmentContract:contractCore,extraContract:extraCore
};
export function legalPack(value='CH'){const code=legalCountryCode(value),base=packs[code]||generic;return{code,name:base.name,source:base.source,note:base.note,reviewedAt:LEGAL_REVIEW_DATE}}
export function legalDocumentSchema(type,value='CH'){const code=legalCountryCode(value),base=packs[code]||generic;return base[type]||commonHr[type]||[]}
export function isLegalHrDocument(type){return['payslip','employmentContract','extraContract','salaryCertificate','timesheet','leaveRequest','employmentCertificate','employmentTermination','onboardingChecklist','salaryChange','expenseReport','trainingRecord'].includes(type)}
const jurisdictionFields={
 CH:[f('employeeAhvNumber','employee'),f('employerAhvNumber','employer')],
 FR:[f('siret','employer'),f('socialSecurityNumber','employee'),f('collectiveAgreement','employment')],
 DE:[f('socialInsuranceNumber','employee'),f('taxId','tax')],
 IT:[f('fiscalCode','employee'),f('ccnlCode','employment')],
 ES:[f('nif','employee'),f('socialSecurityNumber','employee'),f('collectiveAgreement','employment')],
 PT:[f('nif','employee'),f('niss','employee'),f('professionalCategory','employment')],
 NL:[f('cao','employment')],
 GB:[f('niNumber','employee'),f('taxCode','tax')]
};
function uniqueFields(fields){const seen=new Set();return fields.filter(x=>x?.key&&!seen.has(x.key)&&(seen.add(x.key),true))}
export function legalFieldsFor(type,value='CH'){
 const code=legalCountryCode(value),extra=jurisdictionFields[code]||[];
 if(type==='salaryCertificate'){
   return uniqueFields([...identity,...extra,f('period','pay','text',true),f('grossSalary','totals','number',true,{min:0,step:'0.01'}),f('taxableNet','tax','number',false,{min:0,step:'0.01'}),f('socialContributions','deductions','number',false,{min:0,step:'0.01'}),f('netSalary','totals','number',false,{min:0,step:'0.01'}),f('certificateReference','notes'),f('employerSignature','signatures')]);
 }
 const schema=legalDocumentSchema(type,code);
 return isLegalHrDocument(type)?uniqueFields([...schema,...extra]):schema;
}
