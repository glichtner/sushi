import { FHIRDefinitions } from '../../src/fhirdefs/FHIRDefinitions';
import { StructureDefinition } from '../../src/fhirtypes/StructureDefinition';
import { Package, StructureDefinitionExporter } from '../../src/export';
import { FSHDocument, FSHTank } from '../../src/import';
import { FshCode, Profile } from '../../src/fshtypes';
import {
  AssignmentRule,
  CardRule,
  CaretValueRule,
  ContainsRule,
  OnlyRule
} from '../../src/fshtypes/rules';
import { getTestFHIRDefinitions, loggerSpy, testDefsPath, TestFisher } from '../testhelpers';
import { minimalConfig } from '../utils/minimalConfig';

const CONTENT_REFERENCE_PROFILE = 'http://hl7.org/fhir/StructureDefinition/contentReferenceProfile';

function caretRule(path: string, caretPath: string, value: any): CaretValueRule {
  const rule = new CaretValueRule(path);
  rule.caretPath = caretPath;
  rule.value = value;
  return rule;
}

function cardRule(path: string, min: number, max: string): CardRule {
  const rule = new CardRule(path);
  rule.min = min;
  rule.max = max;
  return rule;
}

function assignmentRule(path: string, value: any): AssignmentRule {
  const rule = new AssignmentRule(path);
  rule.value = value;
  return rule;
}

// * <path> ^slicing.discriminator[0].type = #value
// * <path> ^slicing.discriminator[0].path = "<discriminatorPath>"
// * <path> ^slicing.rules = #open
// * <path> contains <sliceName> 0..* and ...
function slicingRules(
  path: string,
  discriminatorPath: string,
  ...sliceNames: string[]
): (CaretValueRule | ContainsRule | CardRule)[] {
  const containsRule = new ContainsRule(path);
  sliceNames.forEach(name => containsRule.items.push({ name }));
  return [
    caretRule(path, 'slicing.discriminator[0].type', new FshCode('value')),
    caretRule(path, 'slicing.discriminator[0].path', discriminatorPath),
    caretRule(path, 'slicing.rules', new FshCode('open')),
    containsRule,
    ...sliceNames.map(name => cardRule(`${path}[${name}]`, 0, '*'))
  ];
}

// * <path> ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
// * <path> ^extension[0].valueUri = "<reference>"
function contentReferenceProfileRules(path: string, reference: string): CaretValueRule[] {
  return [
    caretRule(path, 'extension[0].url', CONTENT_REFERENCE_PROFILE),
    caretRule(path, 'extension[0].valueUri', reference)
  ];
}

describe('ElementDefinition', () => {
  let defs: FHIRDefinitions;
  let fisher: TestFisher;

  beforeAll(async () => {
    defs = await getTestFHIRDefinitions(true, testDefsPath('r4-definitions'));
    const doc = new FSHDocument('fileName');

    // Profile: RecursiveQuestionnaire
    // Parent: Questionnaire
    // * item.item ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item.item ^extension[0].valueUri = "#Questionnaire.item"
    // * item.text 1..1
    // * item.readOnly 0..0
    // * item ^slicing.discriminator[0].type = #value
    // * item ^slicing.discriminator[0].path = "type"
    // * item ^slicing.rules = #open
    // * item contains group 0..* and question 0..*
    // * item[group].type = #group
    // * item[question].type = #string
    // * item[question].item 0..0
    const recursive = new Profile('RecursiveQuestionnaire');
    recursive.parent = 'Questionnaire';
    recursive.rules.push(
      ...contentReferenceProfileRules('item.item', '#Questionnaire.item'),
      cardRule('item.text', 1, '1'),
      cardRule('item.readOnly', 0, '0'),
      ...slicingRules('item', 'type', 'group', 'question'),
      assignmentRule('item[group].type', new FshCode('group')),
      assignmentRule('item[question].type', new FshCode('string')),
      cardRule('item[question].item', 0, '0')
    );
    doc.profiles.set(recursive.name, recursive);

    // Profile: ItemTypes
    // Parent: Questionnaire
    // * item 1..*
    // * item.item ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item.item ^extension[0].valueUri = "#Questionnaire.item"
    // * item.type = #group
    // * item.text 1..1
    const itemTypes = new Profile('ItemTypes');
    itemTypes.parent = 'Questionnaire';
    itemTypes.rules.push(
      cardRule('item', 1, '*'),
      ...contentReferenceProfileRules('item.item', '#Questionnaire.item'),
      assignmentRule('item.type', new FshCode('group')),
      cardRule('item.text', 1, '1')
    );
    doc.profiles.set(itemTypes.name, itemTypes);

    // Profile: UsesItemTypes
    // Parent: Questionnaire
    // * item ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item ^extension[0].valueUri = "http://hl7.org/fhir/us/minimal/StructureDefinition/ItemTypes#Questionnaire.item"
    // * item.text ^short = "Local text"
    // * item.readOnly 0..0
    // * item.item ^extension[0].url = "http://example.org/StructureDefinition/other"
    // * item.item ^extension[0].valueString = "other"
    const usesItemTypes = new Profile('UsesItemTypes');
    usesItemTypes.parent = 'Questionnaire';
    usesItemTypes.rules.push(
      ...contentReferenceProfileRules(
        'item',
        `${minimalConfig.canonical}/StructureDefinition/ItemTypes#Questionnaire.item`
      ),
      caretRule('item.text', 'short', 'Local text'),
      cardRule('item.readOnly', 0, '0'),
      caretRule('item.item', 'extension[0].url', 'http://example.org/StructureDefinition/other'),
      caretRule('item.item', 'extension[0].valueString', 'other')
    );
    doc.profiles.set(usesItemTypes.name, usesItemTypes);

    // Profile: SlicedLibrary
    // Parent: Questionnaire
    // * item ^slicing.discriminator[0].type = #value
    // * item ^slicing.discriminator[0].path = "type"
    // * item ^slicing.rules = #open
    // * item contains group 0..*
    // * item[group].type = #group
    // * item.text 1..1
    const slicedLibrary = new Profile('SlicedLibrary');
    slicedLibrary.parent = 'Questionnaire';
    slicedLibrary.rules.push(
      ...slicingRules('item', 'type', 'group'),
      assignmentRule('item[group].type', new FshCode('group')),
      cardRule('item.text', 1, '1')
    );
    doc.profiles.set(slicedLibrary.name, slicedLibrary);

    // Profile: ReslicingQuestionnaire
    // Parent: Questionnaire
    // * item ^slicing.discriminator[0].type = #value
    // * item ^slicing.discriminator[0].path = "linkId"
    // * item ^slicing.rules = #open
    // * item contains outer 0..*
    // * item[outer].linkId = "outer"
    // * item[outer] ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item[outer] ^extension[0].valueUri = "http://hl7.org/fhir/us/minimal/StructureDefinition/SlicedLibrary#Questionnaire.item"
    const reslicing = new Profile('ReslicingQuestionnaire');
    reslicing.parent = 'Questionnaire';
    reslicing.rules.push(
      ...slicingRules('item', 'linkId', 'outer'),
      assignmentRule('item[outer].linkId', 'outer'),
      ...contentReferenceProfileRules(
        'item[outer]',
        `${minimalConfig.canonical}/StructureDefinition/SlicedLibrary#Questionnaire.item`
      )
    );
    doc.profiles.set(reslicing.name, reslicing);

    // Profile: InitialLibrary
    // Parent: Questionnaire
    // * item.initial 1..1
    // * item.initial.value[x] only integer
    // * item.initial.valueInteger = 42
    const initialLibrary = new Profile('InitialLibrary');
    initialLibrary.parent = 'Questionnaire';
    const onlyInteger = new OnlyRule('item.initial.value[x]');
    onlyInteger.types = [{ type: 'integer' }];
    initialLibrary.rules.push(
      cardRule('item.initial', 1, '1'),
      onlyInteger,
      assignmentRule('item.initial.valueInteger', 42)
    );
    doc.profiles.set(initialLibrary.name, initialLibrary);

    // Profile: UsesInitialLibrary
    // Parent: Questionnaire
    // * item ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item ^extension[0].valueUri = "http://hl7.org/fhir/us/minimal/StructureDefinition/InitialLibrary#Questionnaire.item"
    const usesInitialLibrary = new Profile('UsesInitialLibrary');
    usesInitialLibrary.parent = 'Questionnaire';
    usesInitialLibrary.rules.push(
      ...contentReferenceProfileRules(
        'item',
        `${minimalConfig.canonical}/StructureDefinition/InitialLibrary#Questionnaire.item`
      )
    );
    doc.profiles.set(usesInitialLibrary.name, usesInitialLibrary);

    // Profile: LateReferenceQuestionnaire
    // Parent: Questionnaire
    // * item ^slicing.discriminator[0].type = #value
    // * item ^slicing.discriminator[0].path = "type"
    // * item ^slicing.rules = #open
    // * item contains group 0..*
    // * item[group].type = #group
    // * item.item ^extension[0].url = "http://hl7.org/fhir/StructureDefinition/contentReferenceProfile"
    // * item.item ^extension[0].valueUri = "#Questionnaire.item"
    const lateReference = new Profile('LateReferenceQuestionnaire');
    lateReference.parent = 'Questionnaire';
    lateReference.rules.push(
      ...slicingRules('item', 'type', 'group'),
      assignmentRule('item[group].type', new FshCode('group')),
      ...contentReferenceProfileRules('item.item', '#Questionnaire.item')
    );
    doc.profiles.set(lateReference.name, lateReference);

    const tank = new FSHTank([doc], minimalConfig);
    const pkg = new Package(tank.config);
    fisher = new TestFisher(tank, defs, pkg);
    new StructureDefinitionExporter(tank, pkg, fisher).export();
  });

  beforeEach(() => {
    loggerSpy.reset();
  });

  function freshCopy(name: string): StructureDefinition {
    return StructureDefinition.fromJSON(fisher.fishForFHIR(name));
  }

  describe('#unfoldContentReferenceProfile', () => {
    it('should return false and change nothing when the element has no contentReferenceProfile', () => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const count = sd.elements.length;
      expect(sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher)).toBe(
        false
      );
      expect(sd.elements).toHaveLength(count);
    });

    it('should apply the referenced slicing and type and import the referenced children and slices', () => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const nestedItem = sd.findElement('Questionnaire.item.item');
      expect(nestedItem.contentReference).toBe('#Questionnaire.item');
      expect(nestedItem.unfoldContentReferenceProfile(fisher)).toBe(true);
      expect(nestedItem.type[0].code).toBe('BackboneElement');
      expect(nestedItem.contentReference).toBeUndefined();
      expect(nestedItem.slicing).toEqual(sd.findElement('Questionnaire.item').slicing);
      expect(sd.findElement('Questionnaire.item.item.text').min).toBe(1);
      expect(sd.findElement('Questionnaire.item.item.readOnly').max).toBe('0');
      expect(sd.findElement('Questionnaire.item.item:group').sliceName).toBe('group');
      expect(sd.findElement('Questionnaire.item.item:group.type').patternCode).toBe('group');
      expect(sd.findElement('Questionnaire.item.item:question.type').patternCode).toBe('string');
      expect(sd.findElement('Questionnaire.item.item:question.item').max).toBe('0');
      expect(new Set(sd.elements.map(e => e.id)).size).toBe(sd.elements.length);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should place imported elements after the referencing element and before its sibling slices', () => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const nestedItem = sd.findElement('Questionnaire.item.item');
      nestedItem.unfoldContentReferenceProfile(fisher);
      const start = sd.elements.indexOf(nestedItem);
      const end = sd.elements.findIndex(e => e.id === 'Questionnaire.item:group');
      expect(sd.elements[start + 1].id).toBe('Questionnaire.item.item.id');
      sd.elements
        .filter(
          e =>
            e.id.startsWith('Questionnaire.item.item.') ||
            e.id.startsWith('Questionnaire.item.item:')
        )
        .forEach(e => {
          const index = sd.elements.indexOf(e);
          expect(index).toBeGreaterThan(start);
          expect(index).toBeLessThan(end);
        });
    });

    it('should import slices of the referenced element as reslices of a referencing slice', () => {
      const sd = freshCopy('ReslicingQuestionnaire');
      const outer = sd.findElement('Questionnaire.item:outer');
      expect(outer.unfoldContentReferenceProfile(fisher)).toBe(true);
      const group = sd.findElement('Questionnaire.item:outer/group');
      expect(group.sliceName).toBe('outer/group');
      expect(group.path).toBe('Questionnaire.item');
      expect(sd.findElement('Questionnaire.item:outer/group.type').patternCode).toBe('group');
      expect(sd.findElement('Questionnaire.item:outer.text').min).toBe(1);
      expect(sd.elements.some(e => e.id.includes(':outer:'))).toBe(false);
      expect(outer.getSlices().map(e => e.id)).toEqual(['Questionnaire.item:outer/group']);
    });

    it('should narrow the types of an existing element to the types the referenced element allows', () => {
      const sd = freshCopy('UsesInitialLibrary');
      sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher);
      expect(sd.findElement('Questionnaire.item.initial').min).toBe(1);
      const value = sd.findElement('Questionnaire.item.initial.value[x]');
      expect(value.type.map(t => t.code)).toEqual(['integer']);
      expect(value.fixedInteger ?? value.patternInteger).toBe(42);
    });

    it('should keep the types of an existing element when the referenced element allows none of them', () => {
      const sd = freshCopy('UsesInitialLibrary');
      const value = sd.findElement('Questionnaire.item.initial.value[x]');
      value.type = value.type.filter(t => t.code === 'string');
      sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher);
      expect(value.type.map(t => t.code)).toEqual(['string']);
    });

    it('should qualify fragment references on imported elements with the referenced profile', () => {
      const sd = freshCopy('UsesItemTypes');
      sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher);
      expect(sd.findElement('Questionnaire.item.item').extension).toContainEqual({
        url: CONTENT_REFERENCE_PROFILE,
        valueUri: `${minimalConfig.canonical}/StructureDefinition/ItemTypes#Questionnaire.item`
      });
    });

    it('should keep the values of existing elements and only add what is missing', () => {
      const sd = freshCopy('UsesItemTypes');
      sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher);
      const text = sd.findElement('Questionnaire.item.text');
      expect(text.short).toBe('Local text');
      expect(text.min).toBe(1);
      expect(sd.findElement('Questionnaire.item.type').patternCode).toBe('group');
      expect(sd.findElement('Questionnaire.item.readOnly').max).toBe('0');
    });

    it('should add missing extensions to existing elements', () => {
      const sd = freshCopy('UsesItemTypes');
      sd.findElement('Questionnaire.item').unfoldContentReferenceProfile(fisher);
      const extensions = sd.findElement('Questionnaire.item.item').extension;
      expect(extensions).toHaveLength(2);
      expect(extensions[0]).toEqual({
        url: 'http://example.org/StructureDefinition/other',
        valueString: 'other'
      });
      expect(extensions[1].url).toBe(CONTENT_REFERENCE_PROFILE);
    });

    it("should not apply the referenced element's cardinality to the referencing element", () => {
      const sd = freshCopy('UsesItemTypes');
      const item = sd.findElement('Questionnaire.item');
      item.unfoldContentReferenceProfile(fisher);
      expect(item.min).toBe(0);
      expect(item.max).toBe('*');
    });

    it('should take the extension from the sliced element when a slice child was unfolded before it was set', () => {
      const sd = freshCopy('LateReferenceQuestionnaire');
      const sliceChild = sd.findElement('Questionnaire.item:group.item');
      expect(sliceChild.extension).toBeUndefined();
      expect(sliceChild.unfoldContentReferenceProfile(fisher)).toBe(true);
      expect(sd.findElement('Questionnaire.item:group.item:group').sliceName).toBe('group');
      expect(sd.findElement('Questionnaire.item:group.item:group.type').patternCode).toBe('group');
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should import content only once per element', () => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const nestedItem = sd.findElement('Questionnaire.item.item');
      expect(nestedItem.unfoldContentReferenceProfile(fisher)).toBe(true);
      const count = sd.elements.length;
      expect(nestedItem.unfoldContentReferenceProfile(fisher)).toBe(false);
      expect(sd.elements).toHaveLength(count);
    });

    it('should import content again for a clone of the element', () => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const nestedItem = sd.findElement('Questionnaire.item.item');
      nestedItem.unfoldContentReferenceProfile(fisher);
      const count = sd.elements.length;
      expect(nestedItem.clone().unfoldContentReferenceProfile(fisher)).toBe(true);
      expect(sd.elements).toHaveLength(count);
    });

    it.each([
      [
        'http://example.org/StructureDefinition/Missing#Questionnaire.item',
        /Cannot resolve contentReferenceProfile on Questionnaire\.item\.item: http:\/\/example\.org\/StructureDefinition\/Missing was not found\./
      ],
      [
        '#Questionnaire.missing',
        /Cannot resolve contentReferenceProfile on Questionnaire\.item\.item: .*\/RecursiveQuestionnaire has no element Questionnaire\.missing\./
      ],
      [
        'http://example.org/StructureDefinition/Missing',
        /Invalid contentReferenceProfile on Questionnaire\.item\.item: http:\/\/example\.org\/StructureDefinition\/Missing\. The value must be the canonical URL of a profile followed by '#' and an element id\./
      ]
    ])('should log an error once and import nothing for the reference %s', (reference, message) => {
      const sd = freshCopy('RecursiveQuestionnaire');
      const nestedItem = sd.findElement('Questionnaire.item.item');
      nestedItem.extension.find(e => e.url === CONTENT_REFERENCE_PROFILE).valueUri = reference;
      const count = sd.elements.length;
      expect(nestedItem.unfoldContentReferenceProfile(fisher)).toBe(false);
      expect(nestedItem.unfoldContentReferenceProfile(fisher)).toBe(false);
      expect(sd.elements).toHaveLength(count);
      expect(nestedItem.contentReference).toBe('#Questionnaire.item');
      expect(loggerSpy.getAllMessages('error')).toHaveLength(1);
      expect(loggerSpy.getLastMessage('error')).toMatch(message);
    });
  });
});
