const fs = require('fs');

// Iterate over the JSON files in the directory passed via the first argument
const extractedApis = process.argv
	.slice(2)
	.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

const seen = new Set();
const markAsSeen = (entrypoint) => {
	seen.add(entrypoint.canonicalReference);
	for (const member of entrypoint.members) {
		seen.add(member.canonicalReference);
	}
};

const firstEntryCloned = JSON.parse(JSON.stringify(extractedApis[0]));
const result = {
	...firstEntryCloned,
	members: [],
};

for (const api of extractedApis) {
	if (!seen.has(api.members[0].canonicalReference)) {
		api.members[0].name = api.members[0].canonicalReference.split('!')[0];
		result.members.push(api.members[0]);
		markAsSeen(api.members[0]);
		continue;
	}

	for (const apiMember of api.members[0].members) {
		if (!seen.has(apiMember.canonicalReference)) {
			const entrypoint = result.members.find(
				(entrypoint) =>
					entrypoint.canonicalReference ===
					api.members[0].canonicalReference
			);
			entrypoint.members.push(apiMember);
			seen.add(apiMember.canonicalReference);
		}
	}
}

// Write the result to stdout
console.log(JSON.stringify(result, null, 2));
