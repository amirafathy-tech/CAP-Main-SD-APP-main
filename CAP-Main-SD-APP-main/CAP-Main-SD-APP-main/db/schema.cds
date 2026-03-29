namespace salesdb;

using {managed} from '@sap/cds/common';


// ------------------- Simple DTO-like classes -------------------

type CalculatedQuantitiesResponse : {
  actualQuantity    : Decimal;
  remainingQuantity : Decimal;
  total             : Decimal;
  actualPercentage  : Decimal;
  totalHeader       : Decimal;
}

type TempExecutionOrderData       : {
  actualQuantity       : Decimal;
  remainingQuantity    : Decimal;
  actualPercentage     : Decimal;
  totalHeader          : Decimal;
  total                : Decimal;
  amountPerUnit        : Decimal;
  quantities           : array of Decimal;
  processed            : array of Boolean;
  currentQuantityIndex : Integer;
}

type TotalResult                  : {
  totalWithProfit : Decimal;
  amountPerUnit   : Decimal;
}

type IasUser {
  userName   : String(255);
  value      : String(255);
  familyName : String(255);
  givenName  : String(255);
}

// ------------------- Master Data -------------------

entity Currency : managed {
  key currencyCode : UUID;
      code         : String(225) @unique;
      description  : String not null;
}

entity LineType : managed {
  key lineTypeCode : UUID;
      code         : String(225) @unique;
      description  : String not null;
}

entity MaterialGroup : managed {
  key materialGroupCode : UUID;
      code              : String(225) @unique;
      description       : String not null;
}

entity PersonnelNumber : managed {
  key personnelNumberCode : UUID;
      code                : String(225) @unique;
      description         : String not null;
}

entity UnitOfMeasurement : managed {
  key unitOfMeasurementCode : UUID;
      code                  : String(8) @unique;
      description           : String;
}

entity ServiceType : managed {
  key serviceTypeCode : UUID;
      serviceId       : String(225) @unique;
      description     : String not null;
      lastChangeDate  : Date;
}

// ------------------- Service Number -------------------

entity ServiceNumber : managed {
  key serviceNumberCode              : UUID;
      serviceNumberCodeString        : String @unique;
      noServiceNumber                : Integer;
      searchTerm                     : String;
      serviceTypeCode                : String;
      materialGroupCode              : String;
      unitOfMeasurementCode          : String;
      description                    : String;
      shortTextChangeAllowed         : Boolean;
      deletionIndicator              : Boolean;
      mainItem                       : Boolean;
      numberToBeConverted            : Integer;
      convertedNumber                : Integer;
      lastChangeDate                 : Date;
      serviceText                    : String;
      baseUnitOfMeasurement          : String;
      toBeConvertedUnitOfMeasurement : String;
      defaultUnitOfMeasurement       : String;

      modelSpecificationsDetails     : Composition of many ModelSpecificationsDetails
                                         on modelSpecificationsDetails.serviceNumber = $self;
      mainItemSet                    : Composition of many InvoiceMainItem
                                         on mainItemSet.serviceNumber = $self;
      subItemSet                     : Composition of many InvoiceSubItem
                                         on subItemSet.serviceNumber = $self;
      serviceInvoiceMainSet          : Composition of many ServiceInvoiceMain
                                         on serviceInvoiceMainSet.serviceNumber = $self;
      executionOrderMainSet          : Composition of many ExecutionOrderMain
                                         on executionOrderMainSet.serviceNumber = $self;
}

// ------------------- Formulas -------------------

entity Formula : managed {
  key formulaCode           : UUID;
      formula               : String(4) @unique;
      description           : String not null;
      numberOfParameters    : Integer   @unique;
      parameterIds          : array of String;
      parameterDescriptions : array of String;
      testParameters        : array of Decimal;
      formulaLogic          : String;
      expression            : String;
      result                : Decimal;
}

// ------------------- Execution Orders & Invoices -------------------

entity ExecutionOrderMain : managed {
  key executionOrderMainCode   : UUID;

      referenceSDDocument      : String;
      salesOrderItem           : String;
      debitMemoRequestItem     : String;
      salesOrderItemText       : String;
      referenceId              : String;
      serviceNumberCode        : Integer;
      description              : String;
      unitOfMeasurementCode    : String;
      currencyCode             : String;
      materialGroupCode        : String;
      personnelNumberCode      : String;
      lineTypeCode             : String;
      serviceTypeCode          : String;

      totalQuantity            : Decimal;
      remainingQuantity        : Decimal;
      amountPerUnit            : Decimal;
      total                    : Decimal;
      totalHeader              : Decimal;
      actualQuantity           : Decimal;
      previousQuantity         : Decimal;
      actualPercentage         : Decimal;
      overFulfillmentPercent   : Decimal;

      unlimitedOverFulfillment : Boolean;
      manualPriceEntryAllowed  : Boolean;
      externalServiceNumber    : String;
      serviceText              : String;
      lineText                 : String;
      lineNumber               : String(225) @unique;
      biddersLine              : Boolean;
      supplementaryLine        : Boolean;
      lotCostOne               : Boolean;
      doNotPrint               : Boolean;
      deletionIndicator        : Boolean;

      serviceNumber            : Association to ServiceNumber;
      serviceInvoiceMain       : Composition of ServiceInvoiceMain;
}

entity ServiceInvoiceMain : managed {
  key serviceInvoiceCode       : UUID;

      executionOrderMainCode   : UUID;
      referenceSDDocument      : String;
      debitMemoRequestItem     : String;
      debitMemoRequestItemText : String;
      referenceId              : String;
      serviceNumberCode        : Integer;
      description              : String;
      unitOfMeasurementCode    : String;
      currencyCode             : String;
      materialGroupCode        : String;
      personnelNumberCode      : String;
      lineTypeCode             : String;
      serviceTypeCode          : String;

      remainingQuantity        : Decimal;
      quantity                 : Decimal;
      currentPercentage        : Decimal;
      totalQuantity            : Decimal;
      amountPerUnit            : Decimal;
      total                    : Decimal;
      actualQuantity           : Decimal;
      actualPercentage         : Decimal;
      overFulfillmentPercent   : Decimal;

      unlimitedOverFulfillment : Boolean;
      externalServiceNumber    : String;
      serviceText              : String;
      lineText                 : String;
      lineNumber               : String(225) @unique;
      biddersLine              : Boolean;
      supplementaryLine        : Boolean;
      lotCostOne               : Boolean;
      doNotPrint               : Boolean;
      alternatives             : String;
      totalHeader              : Decimal;
      temporaryDeletion        : String(9);

      serviceNumber            : Association to ServiceNumber;
      executionOrderMain       : Association to ExecutionOrderMain;
}

entity InvoiceMainItem : managed {
  key invoiceMainItemCode     : UUID;

      uniqueId                : String;
      referenceSDDocument     : String;
      salesQuotationItem      : String;
      salesOrderItem          : String;
      salesQuotationItemText  : String;
      referenceId             : String;
      serviceNumberCode       : UUID;
      unitOfMeasurementCode   : String;
      currencyCode            : String;
      formulaCode             : String;
      description             : String;

      quantity                : Decimal;
      amountPerUnit           : Decimal;
      total                   : Decimal;
      totalHeader             : Decimal;
      profitMargin            : Decimal;
      totalWithProfit         : Decimal;
      amountPerUnitWithProfit : Decimal;
      doNotPrint              : Boolean;
      lineNumber              : String(225) @unique;
      subItemList             : Composition of many InvoiceSubItem
                                  on subItemList.invoiceMainItemCode = $self.invoiceMainItemCode;
      // subItemList             : Composition of many InvoiceSubItem
      //                             on subItemList.mainItem = $self;
      serviceNumber           : Association to ServiceNumber;
}

entity InvoiceSubItem : managed {
  key invoiceSubItemCode    : UUID;

      invoiceMainItemCode   : UUID;
      serviceNumberCode     : UUID;
      unitOfMeasurementCode : String;
      currencyCode          : String;
      formulaCode           : String;
      description           : String;
      quantity              : Decimal;
      amountPerUnit         : Decimal;
      total                 : Decimal;

      mainItem              : Association to InvoiceMainItem;
      serviceNumber         : Association to ServiceNumber;
}

// ------------------- Model -------------------


entity ModelSpecificationsDetails : managed {
  key modelSpecDetailsCode : Integer;

  serviceNumberCode         : Integer;
  noServiceNumber           : Integer;
  serviceTypeCode           : String;
  materialGroupCode         : String;
  personnelNumberCode       : String;
  unitOfMeasurementCode     : String;
  currencyCode              : String;
  formulaCode               : String;
  lineTypeCode              : String;
  selectionCheckBox         : Boolean;
  lineIndex                 : String(225);
  shortText                 : String;
  quantity                  : Integer not null;
  grossPrice                : Integer not null;
  overFulfilmentPercentage  : Integer;
  priceChangedAllowed       : Boolean;
  unlimitedOverFulfillment  : Boolean;
  pricePerUnitOfMeasurement : Integer;
  externalServiceNumber     : String(225);
  netValue                  : Integer;
  serviceText               : String;
  lineText                  : String;
  lineNumber                : String(225);
  alternatives              : String;
  biddersLine               : Boolean;
  supplementaryLine         : Boolean;
  lotSizeForCostingIsOne    : Boolean;
  lastChangeDate            : Date;

  modelSpecifications : Association to ModelSpecifications;
  serviceNumber       : Association to ServiceNumber;
}


entity ModelSpecifications : managed {
  key modelSpecCode : Integer;

  currencyCode      : String;
  modelServSpec     : String(225);
  blockingIndicator : Boolean;
  serviceSelection  : Boolean;
  description       : String not null;
  searchTerm        : String;
  lastChangeDate    : Date;

  modelSpecificationsDetails : Composition of many ModelSpecificationsDetails
    on modelSpecificationsDetails.modelSpecifications = $self;
}

