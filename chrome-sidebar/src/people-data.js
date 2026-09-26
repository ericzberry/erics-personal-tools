// Shared reference context. An age belongs to a year, not an invented birthday.
const fail=message=>{throw {status:400,message};};
const text=(v,label,max=200)=>typeof v==='string'&&v.length<=max?v.trim():fail(`Check ${label}.`);
export const PEOPLE_ROLES=['You','Partner','Child','Other'];
export function normalizePerson(input,previous={}){
  const v={...previous,...input};
  if(v.schemaVersion!==undefined&&v.schemaVersion!==1)fail('This context needs a newer app.');
  const name=text(v.name??'','name',120);if(!name)fail('Enter a name or a label.');
  if(!PEOPLE_ROLES.includes(v.role))fail('Choose a relationship.');
  const age=v.age===''||v.age==null?null:Number(v.age),ageYear=v.ageYear===''||v.ageYear==null?null:Number(v.ageYear);
  if((age===null)!==(ageYear===null)||age!==null&&(!Number.isInteger(age)||age<0||age>120||!Number.isInteger(ageYear)||ageYear<1900||ageYear>2200))fail('Enter both an age and its year, or leave both empty.');
  return {schemaVersion:1,name,role:v.role,age,ageYear,location:text(v.location??'','location',300),notes:text(v.notes??'','notes',500)};
}
export function ageInYear(person,year=new Date().getFullYear()){
  if(person.age==null||person.ageYear==null)return null;
  const age=person.age+year-person.ageYear;return age<0||age>120?null:age;
}
export function familyContext(records,year=new Date().getFullYear()){
  return records.filter(p=>!p.deleting&&!p.conflict).map(p=>({name:p.name,relationship:p.role,inFamily:p.role!=='Other',age:ageInYear(p,year),year,ageInReferenceYear:p.age,referenceYear:p.ageYear,location:p.location,notes:p.notes}));
}
// Context is included only when the request refers to family or a saved person.
export function relevantPeople(records,request){
  if(/\b(?:my|our) (?:family|kids|children)\b/i.test(request))return records.filter(p=>p.role!=='Other'||request.toLowerCase().includes(p.name.toLowerCase()));
  return records.filter(p=>p.role!=='You'&&p.name.length>2&&request.toLowerCase().includes(p.name.toLowerCase()));
}
