// map / filter   array
//const nameArr = ["山本","田中","竹内"];
// for (let index = 0;index < nameArr.length; index++){
//  console.log(nameArr[index]);
//  }

//  const nameArr2 = nameArr.map((name)=>{
//  return name;
//  })
// console.log(nameArr2);

// nameArr.map((name)=> console.log(name));

// filter
// const numArr = [1,2,3,4,5];
// const kisuArr = numArr.filter((num)=>{
//  return num  %2 ===1;
// })
// console.log(kisuArr);

const nameArr = ["山本", "田中", "竹内"];
// for (let index = 0;index < nameArr.length; index++){
// // console.log(`Index:${index+1} Name:${nameArr[index]}`);
//  }

nameArr.map((name, index) => console.log(`Index:${index} Name:${name}`));

const SirNameArr = nameArr.map((name) => {
  if (name === "山本") {
    return name;
  } else {
    return `Sir${name}`;
  }
});
console.log(SirNameArr);
